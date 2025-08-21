import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.NOTEAPI_KEY = 'testkey';

test('GET /search without auth should be unauthorized', async () => {
    const searchRoute = (await import('../dist/routes/search.js')).default;
    const app = Fastify();
    await searchRoute(app);
    const res = await app.inject({ method: 'GET', url: '/search?q=test' });
    assert.strictEqual(res.statusCode, 401);
    await app.close();
});

test('GET /notes without auth should be unauthorized', async () => {
    const notesRoute = (await import('../dist/routes/notes.js')).default;
    const app = Fastify();
    await notesRoute(app);
    const res = await app.inject({ method: 'GET', url: '/notes' });
    assert.strictEqual(res.statusCode, 401);
    await app.close();
});

test('GET /folders without auth should be unauthorized', async () => {
    const foldersRoute = (await import('../dist/routes/folders.js')).default;
    const app = Fastify();
    await foldersRoute(app);
    const res = await app.inject({ method: 'GET', url: '/folders' });
    assert.strictEqual(res.statusCode, 401);
    await app.close();
});

test('GET /export without auth should be unauthorized', async () => {
    const exportRoute = (await import('../dist/routes/export.js')).default;
    const app = Fastify();
    await exportRoute(app);
    const res = await app.inject({ method: 'GET', url: '/export' });
    assert.strictEqual(res.statusCode, 401);
    await app.close();
});
