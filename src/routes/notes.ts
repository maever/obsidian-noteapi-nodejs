import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import { vaultResolve, isMarkdown } from '../utils/paths.js';
import matter from 'gray-matter';
import { strongEtagFromBuffer } from '../utils/etag.js';


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
        // TODO: outline/section slicing
        return { frontmatter: parsed.data ?? {}, content: parsed.content };
    });


    app.post('/notes', async (req, reply) => {
        const { path: rel, frontmatter = {}, content = '' } = req.body as any;
        const abs = vaultResolve(rel);
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        if (fssync.existsSync(abs)) return reply.code(409).send({ error: 'Exists' });
        const file = matter.stringify(content, frontmatter);
        await fs.mkdir(abs.substring(0, abs.lastIndexOf('/')), { recursive: true });
        await fs.writeFile(abs, file, 'utf8');
        reply.code(201).send({ ok: true });
    });


    app.put('/notes/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        const ifMatch = req.headers['if-match'];
        if (!ifMatch) return reply.code(428).send({ error: 'Missing If-Match' });
        const cur = await fs.readFile(abs);
        const curTag = strongEtagFromBuffer(cur);
        if (ifMatch !== curTag) return reply.code(412).send({ error: 'ETag mismatch' });
        const { frontmatter = {}, content = '' } = req.body as any;
        const file = matter.stringify(content, frontmatter);
        await fs.writeFile(abs, file, 'utf8');
        const newBuf = await fs.readFile(abs);
        reply.header('ETag', strongEtagFromBuffer(newBuf));
        return { ok: true };
    });


    app.delete('/notes/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        const abs = vaultResolve(p);
        await fs.unlink(abs);
        return { ok: true };
    });


    app.post('/notes/:path/move', async (req, reply) => {
        const p = (req.params as any).path;
        const { newPath } = req.body as any;
        const from = vaultResolve(p);
        const to = vaultResolve(newPath);
        await fs.mkdir(to.substring(0, to.lastIndexOf('/')), { recursive: true });
        await fs.rename(from, to);
        return { ok: true };
    });
}
