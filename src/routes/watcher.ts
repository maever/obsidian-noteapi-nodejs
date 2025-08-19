import chokidar from 'chokidar';
import { CONFIG } from '../config.js';


export function startWatcher() {
    const watcher = chokidar.watch(CONFIG.vaultRoot, { ignoreInitial: true });
    watcher.on('add', (p) => console.log('[indexer] add', p));
    watcher.on('change', (p) => console.log('[indexer] change', p));
    watcher.on('unlink', (p) => console.log('[indexer] del', p));
    return watcher;
}