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

const MEILI_URL = 'http://127.0.0.1:7702';

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

async function waitFor(fn) {
    for (let i = 0; i < 50; i++) {
        if (await fn()) return;
        await delay(100);
    }
    throw new Error('timeout');
}

test('endpoints integration', async () => {
    await ensureMeili();
    const meili = spawn('./meilisearch', ['--no-analytics', '--master-key', 'masterKey', '--http-addr', '127.0.0.1:7702'], { stdio: 'inherit' });
    await waitForMeili();

    const vault = await fs.mkdtemp(path.join(process.cwd(), 'vault-'));
    process.env.VAULT_ROOT = vault;
    process.env.NOTEAPI_KEY = 'testkey';
    process.env.MEILI_MASTER_KEY = 'masterKey';
    process.env.MEILI_HOST = MEILI_URL;
    process.env.MEILI_INDEX = 'notes';

  const notesRoute = (await import('../dist/routes/notes.js')).default;
  const foldersRoute = (await import('../dist/routes/folders.js')).default;
  const exportRoute = (await import('../dist/routes/export.js')).default;
  const searchRoute = (await import('../dist/routes/search.js')).default;
  const adminRoute = (await import('../dist/routes/admin.js')).default;
  const app = Fastify();
  await notesRoute(app);
  await foldersRoute(app);
  await exportRoute(app);
  await searchRoute(app);
  await adminRoute(app);

    const auth = { authorization: 'Bearer testkey' };

    try {
        // Create
        const create = await app.inject({
            method: 'POST',
            url: '/notes',
            headers: auth,
            payload: { path: 'test.md', frontmatter: { tag: 'x' }, content: 'hello' }
        });
        assert.equal(create.statusCode, 201);
        const etag1 = create.headers.etag;
        assert.ok(etag1);

        // Read
        const read = await app.inject({ method: 'GET', url: '/notes/test.md', headers: auth });
        assert.equal(read.statusCode, 200);
        assert.equal(read.headers.etag, etag1);
        assert.equal(read.json().content.trim(), 'hello');

        // Update
        const upd = await app.inject({
            method: 'PATCH',
            url: '/notes/test.md',
            headers: { ...auth, 'if-match': etag1 },
            payload: { content: 'updated' }
        });
        assert.equal(upd.statusCode, 200);
        const etag2 = upd.headers.etag;
        assert.notEqual(etag2, etag1);

        // Update with stale ETag
        const stale = await app.inject({
            method: 'PATCH',
            url: '/notes/test.md',
            headers: { ...auth, 'if-match': etag1 },
            payload: { content: 'again' }
        });
        assert.equal(stale.statusCode, 412);

        // Delete with wrong ETag
        const delWrong = await app.inject({
            method: 'DELETE',
            url: '/notes/test.md',
            headers: { ...auth, 'if-match': 'bogus' }
        });
        assert.equal(delWrong.statusCode, 412);

        // Delete
        const del = await app.inject({
            method: 'DELETE',
            url: '/notes/test.md',
            headers: { ...auth, 'if-match': etag2 }
        });
        assert.equal(del.statusCode, 204);

        // Path traversal
        const trav = await app.inject({
            method: 'POST',
            url: '/notes',
            headers: auth,
            payload: { path: '../escape.md', content: 'x' }
        });
        assert.ok(trav.statusCode === 400 || trav.statusCode === 403);

        // Nested note creation (also for search)
        const nested = await app.inject({
            method: 'POST',
            url: '/notes',
            headers: auth,
            payload: { path: 'a/b/c/note.md', content: 'banana in folder' }
        });
        assert.equal(nested.statusCode, 201);
        const nestedEtag = nested.headers.etag;

        // Folders
        const mkFolder = await app.inject({
            method: 'POST',
            url: '/folders',
            headers: auth,
            payload: { path: 'newdir' }
        });
        assert.equal(mkFolder.statusCode, 201);

         const listFolders = await app.inject({ method: 'GET', url: '/folders', headers: auth });
         assert.equal(listFolders.statusCode, 200);
         const folders = listFolders.json();
         assert(folders.includes('newdir'));
         assert(folders.includes('a'));
        assert(folders.includes('a/b'));
        assert(folders.includes('a/b/c'));

        const listNotes = await app.inject({ method: 'GET', url: '/notes', headers: auth });
        assert.equal(listNotes.statusCode, 200);
        assert(listNotes.json().includes('a/b/c/note.md'));

        const listSub = await app.inject({ method: 'GET', url: '/notes?path=a', headers: auth });
        assert(listSub.json().every((n) => n.startsWith('a/')));

        const expAll = await app.inject({ method: 'GET', url: '/export', headers: auth });
        assert.equal(expAll.statusCode, 200);
        assert(expAll.json().some((n) => n.path === 'a/b/c/note.md'));

         const expSub = await app.inject({ method: 'GET', url: '/export?path=a', headers: auth });
         assert(expSub.json().every((n) => n.path.startsWith('a/')));

        // Search
        let searchRes;
        await waitFor(async () => {
            searchRes = await app.inject({ method: 'GET', url: '/search?q=banana', headers: auth });
            return searchRes.statusCode === 200 && searchRes.json().hits.length > 0;
        });
        assert(searchRes.json().hits[0].snippet.includes('banana'));

        const empty = await app.inject({ method: 'GET', url: '/search?q=doesnotexist', headers: auth });
        assert.equal(empty.statusCode, 200);
        assert.equal(empty.json().hits.length, 0);

        // Admin reindex unauthorized
        const adminNoAuth = await app.inject({ method: 'POST', url: '/admin/reindex' });
        assert.equal(adminNoAuth.statusCode, 401);

        // Admin reindex
        const admin = await app.inject({ method: 'POST', url: '/admin/reindex', headers: auth });
        assert.equal(admin.statusCode, 200);
        assert.equal(admin.json().skipped, false);
        assert(admin.json().indexed > 0);

        // Admin reindex concurrent should back off
        const firstRun = app.inject({ method: 'POST', url: '/admin/reindex', headers: auth });
        const secondRun = app.inject({ method: 'POST', url: '/admin/reindex', headers: auth });
        const [first, second] = await Promise.all([firstRun, secondRun]);
        const success = first.statusCode === 200 ? first : second;
        const skipped = first.statusCode === 200 ? second : first;
        assert.equal(success.statusCode, 200);
        assert.equal(success.json().skipped, false);
        assert.equal(skipped.statusCode, 409);
        assert.equal(skipped.json().skipped, true);
        assert.equal(skipped.json().reason, 'in-flight');

        // Search after reindex
        let postReindex;
        await waitFor(async () => {
            postReindex = await app.inject({ method: 'GET', url: '/search?q=banana', headers: auth });
            return postReindex.statusCode === 200 && postReindex.json().hits.length > 0;
        });
        assert(postReindex.json().hits.length > 0);

        // Ensure nested note still deletable with ETag
        const delBad = await app.inject({
            method: 'DELETE',
            url: '/notes/a/b/c/note.md',
            headers: { ...auth, 'if-match': 'wrong' }
        });
        assert.equal(delBad.statusCode, 412);

        const delNested = await app.inject({
            method: 'DELETE',
            url: '/notes/a/b/c/note.md',
            headers: { ...auth, 'if-match': nestedEtag }
        });
        assert.equal(delNested.statusCode, 204);
    } finally {
        await app.close();
        meili.kill();
        await fs.rm(vault, { recursive: true, force: true });
    }
});
