import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';


async function listDirs(dir: string, base = ''): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (!e.isDirectory()) continue;
        const rel = path.posix.join(base, e.name);
        const abs = path.join(dir, e.name);
        out.push(rel);
        out.push(...await listDirs(abs, rel));
    }
    return out;
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

    app.get('/folders', async () => {
        return await listDirs(CONFIG.vaultRoot, '');
    });


    app.post('/folders', async (req, reply) => {
        const { path: rel } = req.body as any;
        const abs = path.join(CONFIG.vaultRoot, rel);
        await fs.mkdir(abs, { recursive: true });
        reply.code(201).send({ ok: true });
    });
}