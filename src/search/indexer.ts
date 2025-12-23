import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { index, toSearchDoc, searchEnabled } from './meili.js';
import { isMarkdown } from '../utils/paths.js';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', timestamp: pino.stdTimeFunctions.isoTime });

type ReindexSkipReason = 'in-flight' | 'disabled';

export interface ReindexResult {
    indexed: number;
    skipped: boolean;
    reason?: ReindexSkipReason;
}

let reindexInFlight = false;

async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
        if (e.name === '.stfolder') continue;
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'assets') continue; // assets contain non-indexable binaries and images
            files.push(...await walk(abs));
        } else if (e.isFile()) {
            if (!isMarkdown(abs)) continue;
            if (e.name.includes('sync-conflict')) continue;
            files.push(abs);
        }
    }
    return files;
}

export async function reindexAll(): Promise<ReindexResult> {
    if (!searchEnabled || !index) {
        log.warn('Reindex requested but search is disabled');
        return { indexed: 0, skipped: true, reason: 'disabled' };
    }
    if (reindexInFlight) {
        log.warn('Reindex request skipped: already running');
        return { indexed: 0, skipped: true, reason: 'in-flight' };
    }

    const idx = index;
    reindexInFlight = true;
    log.info('Reindex invoked');
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
        if (!docs.length) {
            log.info('Reindex completed with no documents found');
            return { indexed: 0, skipped: false };
        }

        const CHUNK_SIZE = 200;
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
            const batch = docs.slice(i, i + CHUNK_SIZE);
            const task = await idx.addDocuments(batch);
            if ('taskUid' in task) {
                const res = await idx.tasks.waitForTask(task.taskUid);
                if (res.status !== 'succeeded') {
                    log.error({ task: res }, 'Failed to index documents');
                    return { indexed: 0, skipped: false };
                }
            }
        }
        log.info({ count: docs.length }, 'Reindex completed');
        return { indexed: docs.length, skipped: false };
    } catch (err: any) {
        log.error({ err }, 'Error during reindex');
        if (err?.code === 'ENOENT') return { indexed: 0, skipped: false };
        if (err?.type === 'MeiliSearchRequestError') return { indexed: 0, skipped: false };
        throw err;
    } finally {
        reindexInFlight = false;
    }
}
