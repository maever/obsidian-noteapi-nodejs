import Fastify from 'fastify';
import helmet from 'fastify-helmet';
import rateLimit from 'fastify-rate-limit';
import { CONFIG } from './config.js';


// Routes
import health from './routes/health.js';
import notes from './routes/notes.js';
import folders from './routes/folders.js';
import search from './routes/search.js';


const app = Fastify({ logger: true });
await app.register(helmet);
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });


await app.register(health);
await app.register(notes);
await app.register(folders);
await app.register(search);


app.listen({ host: CONFIG.host, port: CONFIG.port })
    .then(() => {
        app.log.info(`NoteAPI listening on http://${CONFIG.host}:${CONFIG.port}`);
    })
    .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });