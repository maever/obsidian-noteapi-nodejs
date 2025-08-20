import { MeiliSearch } from 'meilisearch';
import { CONFIG } from '../config.js';
import path from 'node:path';

export const meili = new MeiliSearch({ host: CONFIG.meili.host, apiKey: CONFIG.meili.key });

async function ensureIndex() {
    try {
        await meili.createIndex(CONFIG.meili.index, { primaryKey: 'path' });
    } catch (err: any) {
        // ignore if index already exists
    }
    const idx = meili.index(CONFIG.meili.index);
    try {
        await idx.updateSettings({
            searchableAttributes: ['title', 'headings', 'content', 'path'],
            displayedAttributes: ['path', 'title', 'headings', 'frontmatter'],
            filterableAttributes: ['path'],
            attributesToHighlight: ['content'],
            attributesToSnippet: ['content:60']
        } as any);
    } catch {
        // ignore unsupported settings
    }
    return idx;
}

export const index = await ensureIndex();

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