import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { index, toSearchDoc } from '../search/meili.js';
import { isMarkdown } from '../utils/paths.js';

async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
        if (e.name === '.stfolder') continue;
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            files.push(...await walk(abs));
        } else if (e.isFile()) {
            if (!isMarkdown(abs)) continue;
            if (e.name.includes('sync-conflict')) continue;
            files.push(abs);
        }
    }
    return files;
}

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== process.env.NOTEAPI_KEY) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.post('/admin/reindex', async () => {
        const absPaths = await walk(CONFIG.vaultRoot);
        const docs = [];
        for (const abs of absPaths) {
            const rel = path.relative(CONFIG.vaultRoot, abs).split(path.sep).join('/');
            const buf = await fs.readFile(abs, 'utf8');
            const parsed = matter(buf);
            const stat = await fs.stat(abs);
            docs.push(toSearchDoc({ path: rel, frontmatter: parsed.data ?? {}, content: parsed.content, mtime: stat.mtimeMs }));
        }
        if (docs.length) await index.addDocuments(docs);
        return { indexed: docs.length };
    });
}

