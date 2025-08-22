import { MeiliSearch } from 'meilisearch';
import pino from 'pino';
import { CONFIG } from '../config.js';
import path from 'node:path';

const log = pino({
    level: process.env.DEBUG_MEILI ? 'debug' : process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime
});

export const meili = new MeiliSearch({ host: CONFIG.meili.host, apiKey: CONFIG.meili.key });

export let index: ReturnType<typeof meili.index> | undefined;
export let searchEnabled = false;

export async function ensureIndex() {
    const idx = meili.index(CONFIG.meili.index);
    try {
        const task = await meili.createIndex(CONFIG.meili.index, { primaryKey: 'path' });
        if ('taskUid' in task) await meili.tasks.waitForTask(task.taskUid);
        log.info({ index: CONFIG.meili.index }, 'Created Meilisearch index');
    } catch (err: any) {
        if (err && err.code === 'index_already_exists') {
            log.debug({ index: CONFIG.meili.index }, 'Meilisearch index already exists');
        } else {
            log.warn({ err }, 'Failed to create Meilisearch index');
        }
    }
    try {
        const info = await idx.getRawInfo();
        if (!info.primaryKey) {
            const task = await idx.update({ primaryKey: 'path' });
            if ('taskUid' in task) await idx.tasks.waitForTask(task.taskUid);
            log.info({ index: CONFIG.meili.index }, 'Set Meilisearch primary key to "path"');
        } else {
            log.info({ index: CONFIG.meili.index, primaryKey: info.primaryKey }, 'Meilisearch primary key already set');
        }
    } catch (err) {
        log.warn({ err }, 'Failed to ensure Meilisearch primary key');
    }
    try {
        const task = await idx.updateSettings({
            searchableAttributes: ['title', 'headings', 'content', 'path'],
            displayedAttributes: ['path', 'title', 'headings', 'frontmatter', 'content'],
            filterableAttributes: ['path']
        });
        if ('taskUid' in task) await idx.tasks.waitForTask(task.taskUid);
    } catch (err) {
        log.warn({ err }, 'Failed to update Meilisearch index settings');
    }
    try {
        await meili.health();
        log.info({ host: CONFIG.meili.host }, 'Meilisearch healthy');
        index = idx;
        searchEnabled = true;
        return idx;
    } catch (err) {
        log.error({ err }, 'Meilisearch health check failed');
        index = undefined;
        searchEnabled = false;
        return undefined;
    }
}

await ensureIndex();

export function extractTitleAndHeadings(content: string): { title: string; headings: string[] } {
    const lines = content.split(/\r?\n/);
    const headings: string[] = [];
    let title = '';
    for (const line of lines) {
        const m = /^(#{1,6})\s+(.*)$/.exec(line);
        if (m) {
            const text = m[2].trim();
            headings.push(text);
            if (!title && m[1].length === 1) title = text;
        }
    }
    return { title, headings };
}

export function toSearchDoc({ path: p, frontmatter, content, mtime }: { path: string; frontmatter: any; content: string; mtime: number }) {
    const { title: t, headings } = extractTitleAndHeadings(content);
    const title = t || path.basename(p, path.extname(p));
    return { path: encodePath(p), title, headings, frontmatter, content, mtime };
}

export function encodePath(p: string): string {
    return Buffer.from(p).toString('base64url');
}

export function decodePath(id: string): string {
    return Buffer.from(id, 'base64url').toString();
}