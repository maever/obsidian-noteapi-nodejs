import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

async function ensureMeili() {
    try {
        await fs.access('./meilisearch');
    } catch {
        execSync('curl -fsSL https://install.meilisearch.com | sh');
    }
}

async function waitForMeili() {
    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch('http://127.0.0.1:7700/health');
            if (res.ok) return;
        } catch {}
        await delay(100);
    }
    throw new Error('Meilisearch failed to start');
}

async function waitFor(fn) {
    for (let i = 0; i < 50; i++) {
        if (await fn()) return;
        await delay(100);
    }
    throw new Error('timeout');
}

test('watcher updates index on note changes', async () => {
    await ensureMeili();
    const meili = spawn('./meilisearch', ['--no-analytics', '--master-key', 'masterKey'], { stdio: 'inherit' });
    await waitForMeili();

    const vault = await fs.mkdtemp(path.join(process.cwd(), 'vault-'));
    process.env.VAULT_ROOT = vault;
    process.env.MEILI_MASTER_KEY = 'masterKey';
    process.env.MEILI_HOST = 'http://127.0.0.1:7700';
    process.env.MEILI_INDEX = 'notes';

    const { startWatcher } = await import('../dist/routes/watcher.js');
    const { index } = await import('../dist/search/meili.js');

    const watcher = startWatcher();
    await once(watcher, 'ready');
    try {
        const file = path.join(vault, 'test.md');

        await fs.writeFile(file, '# T\nhello');
        await waitFor(async () => (await index.search('hello')).hits.length === 1);

        await fs.writeFile(file, '# T\nupdated');
        await waitFor(async () => (await index.search('updated')).hits.length === 1);

        await fs.unlink(file);
        await waitFor(async () => (await index.search('updated')).hits.length === 0);
    } finally {
        await watcher.close();
        meili.kill();
        await fs.rm(vault, { recursive: true, force: true });
    }
});
