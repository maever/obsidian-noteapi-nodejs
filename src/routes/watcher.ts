import chokidar, { FSWatcher } from 'chokidar';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { index, toSearchDoc, encodePath, searchEnabled } from '../search/meili.js';
import { isMarkdown } from '../utils/paths.js';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', timestamp: pino.stdTimeFunctions.isoTime });

const FLUSH_INTERVAL_MS = 2000;
const SUMMARY_INTERVAL_MS = 60000;
const LOG_BATCH_THRESHOLD = Number(process.env.WATCHER_LOG_BATCH_THRESHOLD ?? 5);
const LOG_RATE_LIMIT_MS = 30000;
const TOP_PATHS_LIMIT = 5;
const MAX_IGNORED_SAMPLES = 10;
const WATCHER_VERBOSE = /^true$/i.test(process.env.WATCHER_VERBOSE ?? '');

type PathLogReason = 'add' | 'change' | 'unlink' | 'ignored' | 'queued' | 'dropped';

type PendingAction = { action: 'upsert' | 'delete'; absPath: string };

const pendingActions = new Map<string, PendingAction>();
const pendingEventCounts = new Map<string, number>();
const summaryCounters = { eventsReceived: 0, documentsSent: 0, ignoredPaths: 0 };
const ignoredSamples = new Set<string>();
const lastIndexedHashes = new Map<string, string>();
let lastFlushLogTime = 0;

function logBoth(
    level: 'info' | 'warn' | 'error',
    msg: string,
    data?: Record<string, unknown>
) {
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data) {
        log[level](data, msg);
        consoleFn(`${msg} ${JSON.stringify(data)}`);
    } else {
        log[level](msg);
        consoleFn(msg);
    }
}

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

function toRelPath(absPath: string) {
    return path.relative(CONFIG.vaultRoot, absPath).split(path.sep).join('/');
}

function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function logPathEvent(reason: PathLogReason, absPath: string, extra?: Record<string, unknown>) {
    if (!WATCHER_VERBOSE) return;
    logBoth('info', 'Watcher path event', { reason, path: toRelPath(absPath), ...extra });
}

function recordIgnored(absPath: string) {
    summaryCounters.ignoredPaths += 1;
    if (ignoredSamples.size < MAX_IGNORED_SAMPLES) {
        ignoredSamples.add(toRelPath(absPath));
    }
}

function incrementEventCount(absPath: string) {
    pendingEventCounts.set(absPath, (pendingEventCounts.get(absPath) ?? 0) + 1);
}

function enqueueAction(action: PendingAction['action'], absPath: string) {
    summaryCounters.eventsReceived += 1;
    pendingActions.set(absPath, { action, absPath });
    incrementEventCount(absPath);
}

function handleAddOrChange(absPath: string, event: 'add' | 'change') {
    logPathEvent(event, absPath);
    if (!isMarkdown(absPath)) {
        logPathEvent('dropped', absPath, { event, cause: 'non-markdown' });
        return;
    }
    if (absPath.includes('sync-conflict')) {
        logPathEvent('dropped', absPath, { event, cause: 'sync-conflict' });
        return;
    }
    enqueueAction('upsert', absPath);
    logPathEvent('queued', absPath, { event });
}

function handleUnlink(absPath: string) {
    logPathEvent('unlink', absPath);
    if (!isMarkdown(absPath)) {
        logPathEvent('dropped', absPath, { event: 'unlink', cause: 'non-markdown' });
        return;
    }
    enqueueAction('delete', absPath);
    logPathEvent('queued', absPath, { event: 'unlink' });
}

function topPaths(counts: Map<string, number>) {
    return Array.from(counts.entries())
        .map(([absPath, count]) => ({ path: toRelPath(absPath), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_PATHS_LIMIT);
}

async function flushBatch() {
    if (!searchEnabled || !index) return;
    if (pendingActions.size === 0) return;

    const batch = Array.from(pendingActions.values());
    const batchCounts = new Map(pendingEventCounts);
    pendingActions.clear();
    pendingEventCounts.clear();

    const batchSize = batch.length;
    const pathsForLog = topPaths(batchCounts);
    const logThisFlush = batchSize >= LOG_BATCH_THRESHOLD || Date.now() - lastFlushLogTime >= LOG_RATE_LIMIT_MS;

    if (logThisFlush) {
        logBoth('info', 'Watcher flush start', { batchSize, topPaths: pathsForLog });
        lastFlushLogTime = Date.now();
    }

    const upsertDocs = [];
    const upsertHashes: Array<{ absPath: string; hash: string }> = [];
    const deleteIds: string[] = [];

    for (const entry of batch) {
        const rel = toRelPath(entry.absPath);
        if (entry.action === 'upsert') {
            try {
                const buf = await fs.readFile(entry.absPath, 'utf8');
                const currentHash = hashContent(buf);
                const previousHash = lastIndexedHashes.get(entry.absPath);
                if (previousHash === currentHash) {
                    logPathEvent('dropped', entry.absPath, { event: 'change', cause: 'no-content-change' });
                    continue;
                }
                const parsed = matter(buf);
                const stat = await fs.stat(entry.absPath);
                upsertDocs.push(
                    toSearchDoc({
                        path: rel,
                        frontmatter: parsed.data ?? {},
                        content: parsed.content,
                        mtime: stat.mtimeMs
                    })
                );
                upsertHashes.push({ absPath: entry.absPath, hash: currentHash });
            } catch (err) {
                logBoth('error', 'Watcher failed to prepare document for indexing', { err, path: rel });
            }
        } else {
            deleteIds.push(encodePath(rel));
        }
    }

    let documentsSent = 0;

    if (upsertDocs.length > 0) {
        try {
            await index.addDocuments(upsertDocs);
            documentsSent += upsertDocs.length;
            for (const entry of upsertHashes) {
                lastIndexedHashes.set(entry.absPath, entry.hash);
            }
        } catch (err) {
            logBoth('error', 'Watcher failed to index documents', { err, count: upsertDocs.length });
        }
    }

    if (deleteIds.length > 0) {
        try {
            await index.deleteDocuments(deleteIds);
            documentsSent += deleteIds.length;
            for (const entry of batch) {
                if (entry.action === 'delete') {
                    lastIndexedHashes.delete(entry.absPath);
                }
            }
        } catch (err) {
            logBoth('error', 'Watcher failed to delete documents', { err, count: deleteIds.length });
        }
    }

    summaryCounters.documentsSent += documentsSent;

    if (logThisFlush) {
        logBoth('info', 'Watcher flush complete', {
            batchSize,
            documentsSent,
            remainingQueue: pendingActions.size,
            topPaths: pathsForLog
        });
    }
}

function logSummary() {
    if (!searchEnabled) return;
    const summary = {
        eventsReceived: summaryCounters.eventsReceived,
        documentsSent: summaryCounters.documentsSent,
        ignoredPaths: summaryCounters.ignoredPaths,
        queued: pendingActions.size,
        ignoredSamples: Array.from(ignoredSamples)
    };
    logBoth('info', 'Watcher minute summary', summary);
    summaryCounters.eventsReceived = 0;
    summaryCounters.documentsSent = 0;
    summaryCounters.ignoredPaths = 0;
    ignoredSamples.clear();
}

export function startWatcher(): FSWatcher {
    if (!searchEnabled || !index) {
        return { close: async () => {} } as unknown as FSWatcher;
    }
    logBoth('info', 'Watcher ignoring patterns', { patterns: IGNORED_PATTERNS });
    const watcher = chokidar.watch(CONFIG.vaultRoot, {
        ignoreInitial: true,
        ignored: (p: string) => {
            const base = path.basename(p);
            const ignored = shouldIgnore(base);
            if (ignored) {
                recordIgnored(p);
                logPathEvent('ignored', p, { reason: 'pattern', base });
            }
            return ignored;
        }
    });

    watcher.on('add', (p) => handleAddOrChange(p, 'add'));
    watcher.on('change', (p) => handleAddOrChange(p, 'change'));
    watcher.on('unlink', handleUnlink);

    const flushTimer = setInterval(() => {
        void flushBatch();
    }, FLUSH_INTERVAL_MS);
    const summaryTimer = setInterval(logSummary, SUMMARY_INTERVAL_MS);

    const originalClose = watcher.close.bind(watcher);
    watcher.close = async () => {
        clearInterval(flushTimer);
        clearInterval(summaryTimer);
        await flushBatch();
        pendingActions.clear();
        pendingEventCounts.clear();
        ignoredSamples.clear();
        lastIndexedHashes.clear();
        await originalClose();
    };

    return watcher;
}
