import chokidar, { FSWatcher } from 'chokidar';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { index, toSearchDoc, encodePath, searchEnabled } from '../search/meili.js';
import { isMarkdown } from '../utils/paths.js';

// Syncthing metadata and editor temp files pollute the search index, so skip them explicitly.
const IGNORED_PATTERNS = [
    'assets/',
    '.stfolder',
    '.stignore',
    '.syncthing.*',
    '~syncthing~*',
    '.tmp',
    '*.tmp',
    '*.swp',
    '*.swo',
    '*.swpx',
    '*.lock',
    '#*#',
    '.#*',
    '*~',
    '.*'
];

function shouldIgnore(base: string): boolean {
    if (base === 'assets') return true; // assets contain non-indexable binaries and images
    if (base === '.stfolder' || base === '.stignore') return true;
    if (base.startsWith('.syncthing.') || base.startsWith('~syncthing~')) return true;
    if (base === '.tmp' || base.endsWith('.tmp')) return true;
    if (base.endsWith('.swp') || base.endsWith('.swo') || base.endsWith('.swpx')) return true;
    if (base.endsWith('.lock')) return true;
    if (base.startsWith('.#')) return true;
    if (base.startsWith('#') && base.endsWith('#')) return true;
    if (base.endsWith('~')) return true;
    if (base.startsWith('.')) return true;
    return false;
}

async function handleAddOrChange(absPath: string) {
    if (!searchEnabled || !index) return;
    if (!isMarkdown(absPath) || absPath.includes('sync-conflict')) return;
    try {
        const rel = path.relative(CONFIG.vaultRoot, absPath).split(path.sep).join('/');
        const buf = await fs.readFile(absPath, 'utf8');
        const parsed = matter(buf);
        const stat = await fs.stat(absPath);
        await index.addDocuments([
            toSearchDoc({ path: rel, frontmatter: parsed.data ?? {}, content: parsed.content, mtime: stat.mtimeMs })
        ]);
    } catch (err) {
        console.error('watcher add/change error', err);
    }
}

async function handleUnlink(absPath: string) {
    if (!searchEnabled || !index) return;
    if (!isMarkdown(absPath)) return;
    try {
        const rel = path.relative(CONFIG.vaultRoot, absPath).split(path.sep).join('/');
        await index.deleteDocument(encodePath(rel));
    } catch (err) {
        console.error('watcher unlink error', err);
    }
}

export function startWatcher(): FSWatcher {
    if (!searchEnabled || !index) {
        return { close: async () => {} } as unknown as FSWatcher;
    }
    console.log(`watcher ignoring patterns: ${IGNORED_PATTERNS.join(', ')}`);
    const watcher = chokidar.watch(CONFIG.vaultRoot, {
        ignoreInitial: true,
        ignored: (p: string) => {
            const base = path.basename(p);
            return shouldIgnore(base);
        }
    });

    watcher.on('add', handleAddOrChange);
    watcher.on('change', handleAddOrChange);
    watcher.on('unlink', handleUnlink);
    return watcher;
}
