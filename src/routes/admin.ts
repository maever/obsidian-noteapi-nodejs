import { FastifyInstance } from 'fastify';
import { reindexAll } from '../search/indexer.js';
import { CONFIG } from '../config.js';

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.post('/admin/reindex', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (_req, reply) => {
        const result = await reindexAll();
        if (result.skipped) {
            const status = result.reason === 'in-flight' ? 409 : 503;
            return reply.code(status).send({ ...result, error: 'Reindex skipped' });
        }
        return reply.send(result);
    });
}
