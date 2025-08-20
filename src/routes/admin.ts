import { FastifyInstance } from 'fastify';
import { reindexAll } from '../search/indexer.js';
import { CONFIG } from '../config.js';

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.post('/admin/reindex', async () => {
        const indexed = await reindexAll();
        return { indexed };
    });
}

