import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { index, toSearchDoc, searchEnabled } from './meili.js';
import { isMarkdown } from '../utils/paths.js';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', timestamp: pino.stdTimeFunctions.isoTime });

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

export async function reindexAll(): Promise<number> {
    if (!searchEnabled || !index) return 0;
    const idx = index;
    try {
        const absPaths = await walk(CONFIG.vaultRoot);
        const docs: any[] = [];
        for (const abs of absPaths) {
            const rel = path.relative(CONFIG.vaultRoot, abs).split(path.sep).join('/');
            const buf = await fs.readFile(abs, 'utf8');
            const parsed = matter(buf);
            const stat = await fs.stat(abs);
            docs.push(toSearchDoc({ path: rel, frontmatter: parsed.data ?? {}, content: parsed.content, mtime: stat.mtimeMs }));
        }
        if (!docs.length) return 0;

        const CHUNK_SIZE = 200;
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
            const batch = docs.slice(i, i + CHUNK_SIZE);
            const task = await idx.addDocuments(batch);
            if ('taskUid' in task) {
                const res = await idx.tasks.waitForTask(task.taskUid);
                if (res.status !== 'succeeded') {
                    log.error({ task: res }, 'Failed to index documents');
                    return 0;
                }
            }
        }
        return docs.length;
    } catch (err: any) {
        log.error({ err }, 'Error during reindex');
        if (err?.code === 'ENOENT') return 0;
        if (err?.type === 'MeiliSearchRequestError') return 0;
        throw err;
    }
}
