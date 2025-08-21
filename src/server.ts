import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import { parse } from 'yaml';
import { CONFIG } from './config.js';

// Routes
import health from './routes/health.js';
import notes from './routes/notes.js';
import folders from './routes/folders.js';
import search from './routes/search.js';
import admin from './routes/admin.js';
import graph from './routes/graph.js';
import exporter from './routes/export.js';
import { reindexAll } from './search/indexer.js';
import { startWatcher } from './routes/watcher.js';
import { searchEnabled } from './search/meili.js';

const openapi = parse(
    fs.readFileSync(new URL('../openapi/noteapi.yaml', import.meta.url), 'utf8')
);

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
await app.register(helmet);
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

app.get('/openapi.json', async (_req, reply) => {
    reply.header('Content-Type', 'application/json');
    return openapi;
});

await app.register(health);
await app.register(notes);
await app.register(folders);
await app.register(search);
await app.register(admin);
await app.register(graph);
await app.register(exporter);

try {
    const count = await reindexAll();
    if (searchEnabled) {
        app.log.info(`Indexed ${count} notes`);
    } else {
        app.log.warn('Search index unavailable; skipping indexing');
    }
} catch (err) {
    app.log.error({ err }, 'Failed to build search index');
}

const watcher = startWatcher();
app.addHook('onClose', async () => {
    await watcher.close();
});

app.listen({ host: CONFIG.host, port: CONFIG.port })
    .then(() => {
        app.log.info(`NoteAPI listening on http://${CONFIG.host}:${CONFIG.port}`);
    })
    .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });

