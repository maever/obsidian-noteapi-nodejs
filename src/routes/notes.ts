import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { vaultResolve, isMarkdown, ensureParentDir } from '../utils/paths.js';
import { CONFIG } from '../config.js';
import matter from 'gray-matter';
import { strongEtagFromBuffer } from '../utils/etag.js';
import { index, toSearchDoc, encodePath, searchEnabled } from '../search/meili.js';

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

async function listNotes(rel: string): Promise<string[]> {
    const abs = vaultResolve(rel);
    const out: string[] = [];
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const relPath = path.posix.join(rel, e.name);
        const absPath = path.join(abs, e.name);
        if (e.isDirectory()) {
            out.push(...await listNotes(relPath));
        } else if (isMarkdown(absPath)) {
            out.push(relPath);
        }
    }
    return out;
}

interface ReadNoteResult {
    path: string;
    frontmatter: any;
    lines: string[];
    headings: { level: number; title: string; line: number }[];
    toc: { level: number; title: string }[];
    etag: string;
}

async function readNote(p: string): Promise<ReadNoteResult> {
    let abs: string;
    try {
        abs = vaultResolve(p);
    } catch {
        throw new Error('Invalid path');
    }
    if (!isMarkdown(abs)) throw new Error('Not a Markdown path');
    let buf: Buffer;
    try {
        buf = await fs.readFile(abs);
    } catch (err: any) {
        if (err?.code === 'ENOENT') throw new Error('Not found');
        throw err;
    }
    const etag = strongEtagFromBuffer(buf);
    const parsed = matter(buf.toString('utf8'));
    const lines = parsed.content.split(/\r?\n/);
    const headings: { level: number; title: string; line: number }[] = [];
    lines.forEach((line, idx) => {
        const m = /^(#{1,3})\s+(.*)$/.exec(line);
        if (m) headings.push({ level: m[1].length, title: m[2].trim(), line: idx });
    });
    const toc = headings.map(h => ({ level: h.level, title: h.title }));
    return { path: p, frontmatter: parsed.data ?? {}, lines, headings, toc, etag };
}


export default async function route(app: FastifyInstance) {
    // Auth guard (simple API key)
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });


    app.get('/notes', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    path: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { path: rel = '' } = req.query as any;
        try {
            vaultResolve(rel);
        } catch {
            return reply.code(400).send({ error: 'Invalid path' });
        }
        return await listNotes(rel);
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
        let note: ReadNoteResult;
        try {
            note = await readNote(p);
        } catch (e: any) {
            const msg = e?.message || 'Error';
            if (msg === 'Invalid path' || msg === 'Not a Markdown path') {
                return reply.code(400).send({ error: msg });
            }
            if (msg === 'Not found') {
                return reply.code(404).send({ error: msg });
            }
            throw e;
        }
        reply.header('ETag', note.etag);

        const { section, range } = req.query as { section?: string; range?: string };
        let contentLines = note.lines;
        const headings = note.headings;
        const toc = note.toc;

        if (section) {
            const idx = headings.findIndex(h => h.title === section);
            if (idx === -1) return reply.code(404).send({ error: 'Section not found', toc });
            const start = headings[idx].line + 1;
            const end = idx + 1 < headings.length ? headings[idx + 1].line : note.lines.length;
            contentLines = note.lines.slice(start, end);
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

        return { path: p, frontmatter: note.frontmatter, content, toc, etag: note.etag };
    });

    app.post('/notes/batch', async (req, reply) => {
        const body = req.body as any;
        if (!body || !Array.isArray(body.paths) || !body.paths.every((p: any) => typeof p === 'string')) {
            return reply.code(400).send({ error: 'Invalid paths' });
        }
        const notes: any[] = [];
        const errors: Record<string, string> = {};
        for (const p of body.paths) {
            try {
                const note = await readNote(p);
                notes.push({ path: p, frontmatter: note.frontmatter, content: note.lines.join('\n'), toc: note.toc, etag: note.etag });
            } catch (e: any) {
                errors[p] = e?.message || 'Error';
            }
        }
        const res: any = { notes };
        if (Object.keys(errors).length) res.errors = errors;
        return res;
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
        if (searchEnabled && index) {
            await index.addDocuments([toSearchDoc({ path: rel, frontmatter, content, mtime: stats.mtimeMs })]);
        }
        reply.code(201).header('ETag', strongEtagFromBuffer(file)).send({ ok: true });
    });


    app.patch('/notes/*', {
        schema: {
            querystring: {
                type: 'object',
                properties: { ifMatch: { type: 'string' } }
            }
        }
    }, async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        const ifMatch = (req.headers['if-match'] ?? (req.query as any).ifMatch) as string | undefined;
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
        if (searchEnabled && index) {
            await index.addDocuments([toSearchDoc({ path: p, frontmatter: fm, content, mtime: stats.mtimeMs })]);
        }
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
        if (searchEnabled && index) {
            await index.addDocuments([toSearchDoc({ path: newPath, frontmatter: parsed.data ?? {}, content: parsed.content, mtime: stats.mtimeMs })]);
            await index.deleteDocument(encodePath(p));
        }
        reply.header('ETag', strongEtagFromBuffer(buf));
        return { ok: true };
    });


    app.delete('/notes/*', {
        schema: {
            querystring: {
                type: 'object',
                properties: { ifMatch: { type: 'string' } }
            }
        }
    }, async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        const ifMatch = (req.headers['if-match'] ?? (req.query as any).ifMatch) as string | undefined;
        if (!ifMatch) return reply.code(412).send({ error: 'Missing If-Match' });
        const cur = await fs.readFile(abs);
        const curTag = strongEtagFromBuffer(cur);
        if (ifMatch !== curTag) return reply.code(412).send({ error: 'ETag mismatch' });
        if (CONFIG.trashEnabled) {
            const trashRel = path.join('.trash', new Date().toISOString(), p);
            const trashAbs = vaultResolve(trashRel);
            await ensureParentDir(trashAbs);
            await fs.rename(abs, trashAbs);
        } else {
            await fs.unlink(abs);
        }
        if (searchEnabled && index) {
            await index.deleteDocument(encodePath(p));
        }
        reply.code(204).send();
    });
}
