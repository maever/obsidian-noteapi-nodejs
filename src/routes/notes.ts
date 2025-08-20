import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { vaultResolve, isMarkdown, ensureParentDir } from '../utils/paths.js';
import matter from 'gray-matter';
import { strongEtagFromBuffer } from '../utils/etag.js';
import { index, toSearchDoc, encodePath } from '../search/meili.js';

async function writeNoteAtomic(absPath: string, buffer: Buffer) {
    const tmp = absPath + '.__tmp';
    const handle = await fs.open(tmp, 'w');
    try {
        await handle.write(buffer);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.rename(tmp, absPath);
}


export default async function route(app: FastifyInstance) {
    // Auth guard (simple API key)
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== process.env.NOTEAPI_KEY) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });


    app.get('/notes/*', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    section: { type: 'string' },
                    range: { type: 'string', pattern: '^\\d+-\\d+$' }
                }
            }
        }
    }, async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        const buf = await fs.readFile(abs);
        const etag = strongEtagFromBuffer(buf);
        reply.header('ETag', etag);

        const parsed = matter(buf.toString('utf8'));
        const lines = parsed.content.split(/\r?\n/);
        const headings: { level: number; title: string; line: number }[] = [];
        lines.forEach((line, idx) => {
            const m = /^(#{1,3})\s+(.*)$/.exec(line);
            if (m) headings.push({ level: m[1].length, title: m[2].trim(), line: idx });
        });
        const toc = headings.map(h => ({ level: h.level, title: h.title }));

        const { section, range } = req.query as { section?: string; range?: string };
        let contentLines = lines;

        if (section) {
            const idx = headings.findIndex(h => h.title === section);
            if (idx === -1) return reply.code(404).send({ error: 'Section not found', toc });
            const start = headings[idx].line + 1;
            const end = idx + 1 < headings.length ? headings[idx + 1].line : lines.length;
            contentLines = lines.slice(start, end);
        }

        if (range) {
            const m = /^(\d+)-(\d+)$/.exec(range);
            if (!m) return reply.code(400).send({ error: 'Invalid range', toc });
            const start = parseInt(m[1], 10) - 1;
            const end = parseInt(m[2], 10);
            if (start < 0 || start >= end || end > contentLines.length) {
                return reply.code(400).send({ error: 'Invalid range', toc });
            }
            contentLines = contentLines.slice(start, end);
        }

        let content = contentLines.join('\n');
        if (section && !range) content = content.trim();

        return { frontmatter: parsed.data ?? {}, content, toc };
    });


    app.post('/notes', async (req, reply) => {
        const { path: rel, frontmatter = {}, content = '' } = req.body as any;
        let abs: string;
        try {
            abs = vaultResolve(rel);
        } catch {
            return reply.code(400).send({ error: 'Invalid path' });
        }
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        if (fssync.existsSync(abs)) return reply.code(409).send({ error: 'Exists' });
        const file = Buffer.from(matter.stringify(content, frontmatter));
        await ensureParentDir(abs);
        await writeNoteAtomic(abs, file);
        const stats = await fs.stat(abs);
        await index.addDocuments([toSearchDoc({ path: rel, frontmatter, content, mtime: stats.mtimeMs })]);
        reply.code(201).header('ETag', strongEtagFromBuffer(file)).send({ ok: true });
    });


    app.patch('/notes/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        const ifMatch = req.headers['if-match'];
        if (!ifMatch) return reply.code(412).send({ error: 'Missing If-Match' });
        const cur = await fs.readFile(abs);
        const curTag = strongEtagFromBuffer(cur);
        if (ifMatch !== curTag) return reply.code(412).send({ error: 'ETag mismatch' });

        const parsed = matter(cur.toString('utf8'));
        const body = req.body as any;
        const fm = body.frontmatter ?? parsed.data;
        const content = typeof body.content === 'string' ? body.content : parsed.content;
        const newBuf = Buffer.from(matter.stringify(content, fm));
        await writeNoteAtomic(abs, newBuf);
        const stats = await fs.stat(abs);
        await index.addDocuments([toSearchDoc({ path: p, frontmatter: fm, content, mtime: stats.mtimeMs })]);
        reply.header('ETag', strongEtagFromBuffer(newBuf));
        return { ok: true };
    });

    app.post('/notes/*', async (req, reply) => {
        const star = (req.params as any)['*'];
        if (!star.endsWith('/move')) return reply.code(404).send();
        const p = star.slice(0, -5);
        const abs = vaultResolve(p);
        const { newPath } = req.body as any;
        if (typeof newPath !== 'string') return reply.code(400).send({ error: 'Invalid newPath' });
        let destAbs: string;
        try {
            destAbs = vaultResolve(newPath);
        } catch {
            return reply.code(400).send({ error: 'Invalid newPath' });
        }
        if (!isMarkdown(destAbs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        if (fssync.existsSync(destAbs)) return reply.code(409).send({ error: 'Exists' });
        await ensureParentDir(destAbs);
        let buf: Buffer;
        try {
            buf = await fs.readFile(abs);
        } catch {
            return reply.code(404).send({ error: 'Not found' });
        }
        await fs.rename(abs, destAbs);
        const parsed = matter(buf.toString('utf8'));
        const stats = await fs.stat(destAbs);
        await index.addDocuments([toSearchDoc({ path: newPath, frontmatter: parsed.data ?? {}, content: parsed.content, mtime: stats.mtimeMs })]);
        await index.deleteDocument(encodePath(p));
        reply.header('ETag', strongEtagFromBuffer(buf));
        return { ok: true };
    });


    app.delete('/notes/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        const ifMatch = req.headers['if-match'];
        if (!ifMatch) return reply.code(412).send({ error: 'Missing If-Match' });
        const cur = await fs.readFile(abs);
        const curTag = strongEtagFromBuffer(cur);
        if (ifMatch !== curTag) return reply.code(412).send({ error: 'ETag mismatch' });
        if (process.env.TRASH_ENABLED === 'true') {
            const trashRel = path.join('.trash', new Date().toISOString(), p);
            const trashAbs = vaultResolve(trashRel);
            await ensureParentDir(trashAbs);
            await fs.rename(abs, trashAbs);
        } else {
            await fs.unlink(abs);
        }
        await index.deleteDocument(encodePath(p));
        reply.code(204).send();
    });
}
