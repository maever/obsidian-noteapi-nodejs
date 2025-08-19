import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';


async function tree(dir: string, base = ''): Promise<any[]> {
    const out: any[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const rel = path.posix.join(base, e.name);
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            out.push({ type: 'dir', path: rel, children: await tree(abs, rel) });
        } else {
            out.push({ type: 'file', path: rel });
        }
    }
    return out;
}


export default async function route(app: FastifyInstance) {
    app.get('/folders', async () => {
        return await tree(CONFIG.vaultRoot, '');
    });


    app.post('/folders', async (req) => {
        const { path: rel } = req.body as any;
        const abs = path.join(CONFIG.vaultRoot, rel);
        await fs.mkdir(abs, { recursive: true });
        return { ok: true };
    });
}