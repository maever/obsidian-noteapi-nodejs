import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { vaultResolve, isMarkdown } from '../utils/paths.js';

async function walk(rel: string): Promise<any[]> {
    const abs = vaultResolve(rel);
    const out: any[] = [];
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const relPath = path.posix.join(rel, e.name);
        const absPath = path.join(abs, e.name);
        if (e.isDirectory()) {
            out.push(...await walk(relPath));
        } else if (isMarkdown(absPath)) {
            const raw = await fs.readFile(absPath, 'utf8');
            const parsed = matter(raw);
            out.push({ path: relPath, frontmatter: parsed.data ?? {}, content: parsed.content });
        }
    }
    return out;
}

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.get('/export', {
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
        return await walk(rel);
    });
}
