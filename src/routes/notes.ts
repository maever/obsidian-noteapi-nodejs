import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { vaultResolve, isMarkdown, ensureParentDir } from '../utils/paths.js';
import matter from 'gray-matter';
import { strongEtagFromBuffer } from '../utils/etag.js';

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


    app.get('/notes/*', async (req, reply) => {
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

        const section = (req.query as any).section as string | undefined;
        let content = parsed.content;
        if (section) {
            const idx = headings.findIndex(h => h.title === section);
            if (idx === -1) return reply.code(404).send({ error: 'Section not found', toc });
            const start = headings[idx].line + 1;
            const end = idx + 1 < headings.length ? headings[idx + 1].line : lines.length;
            content = lines.slice(start, end).join('\n').trim();
        }
        return { frontmatter: parsed.data ?? {}, content, toc };
    });


    app.post('/notes', async (req, reply) => {
        const { path: rel, frontmatter = {}, content = '' } = req.body as any;
        const abs = vaultResolve(rel);
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        if (fssync.existsSync(abs)) return reply.code(409).send({ error: 'Exists' });
        const file = Buffer.from(matter.stringify(content, frontmatter));
        await ensureParentDir(abs);
        await writeNoteAtomic(abs, file);
        reply.code(201).send({ ok: true });
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
        let destAbs = abs;
        const newRel = body.path as string | undefined;
        if (newRel && newRel !== p) {
            destAbs = vaultResolve(newRel);
            if (!isMarkdown(destAbs)) return reply.code(400).send({ error: 'Not a Markdown path' });
            if (fssync.existsSync(destAbs)) return reply.code(409).send({ error: 'Exists' });
            await ensureParentDir(destAbs);
        }
        const newBuf = Buffer.from(matter.stringify(content, fm));
        await writeNoteAtomic(destAbs, newBuf);
        if (destAbs !== abs) await fs.unlink(abs);
        reply.header('ETag', strongEtagFromBuffer(newBuf));
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
        return { ok: true };
    });
}
