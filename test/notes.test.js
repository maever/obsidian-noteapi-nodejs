import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Fastify from 'fastify';

async function ensureMeili() {
    try {
        await fs.access('./meilisearch');
    } catch {
        execSync('curl -fsSL https://install.meilisearch.com | sh');
    }
}

const MEILI_URL = 'http://127.0.0.1:7701';

async function waitForMeili() {
    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch(MEILI_URL + '/health');
            if (res.ok) return;
        } catch {}
        await delay(100);
    }
    throw new Error('Meilisearch failed to start');
}

test('POST /notes/{path}/move moves note', async () => {
    await ensureMeili();
    const meili = spawn('./meilisearch', ['--no-analytics', '--master-key', 'masterKey', '--http-addr', '127.0.0.1:7701'], { stdio: 'inherit' });
    await waitForMeili();

    const vault = await fs.mkdtemp(path.join(process.cwd(), 'vault-'));
    process.env.VAULT_ROOT = vault;
    process.env.NOTEAPI_KEY = 'testkey';
    process.env.MEILI_MASTER_KEY = 'masterKey';
    process.env.MEILI_HOST = MEILI_URL;
    process.env.MEILI_INDEX = 'notes';

    const notesRoute = (await import('../dist/routes/notes.js')).default;
    const app = Fastify();
    await notesRoute(app);

    try {
        const create = await app.inject({
            method: 'POST',
            url: '/notes',
            headers: { authorization: 'Bearer testkey' },
            payload: { path: 'old.md', content: 'hello' }
        });
        assert.equal(create.statusCode, 201);

        const move = await app.inject({
            method: 'POST',
            url: '/notes/old.md/move',
            headers: { authorization: 'Bearer testkey' },
            payload: { newPath: 'new.md' }
        });
        assert.equal(move.statusCode, 200);

        await assert.rejects(fs.access(path.join(vault, 'old.md')));

        const newRes = await app.inject({
            method: 'GET',
            url: '/notes/new.md',
            headers: { authorization: 'Bearer testkey' }
        });
        assert.equal(newRes.statusCode, 200);
        assert.equal(newRes.json().content.trim(), 'hello');
    } finally {
        await app.close();
        meili.kill();
        await fs.rm(vault, { recursive: true, force: true });
    }
});

