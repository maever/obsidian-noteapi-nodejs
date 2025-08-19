import { FastifyInstance } from 'fastify';
import { index } from '../search/meili.js';


export default async function route(app: FastifyInstance) {
    app.get('/search', {
        schema: {
            querystring: {
                type: 'object',
                required: ['q'],
                properties: {
                    q: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
                }
            }
        }
    }, async (req) => {
        const { q, limit } = req.query as { q: string; limit?: number };
        const res = await index.search(q, { limit, attributesToHighlight: ['body', 'title'] });
        return {
            hits: res.hits.map((h: any) => ({
                path: h.path,
                title: h.title,
                snippet: (h._formatted?.body ?? '').slice(0, 400),
                score: h._matchesPosition ? Object.keys(h._matchesPosition).length : undefined
            }))
        };
    });
}