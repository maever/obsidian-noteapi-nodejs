import { FastifyInstance } from 'fastify';
import { reindexAll } from '../search/indexer.js';

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== process.env.NOTEAPI_KEY) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.post('/admin/reindex', async () => {
        const indexed = await reindexAll();
        return { indexed };
    });
}

