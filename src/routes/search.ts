import { FastifyInstance } from 'fastify';
import { index, decodePath } from '../search/meili.js';
import { CONFIG } from '../config.js';


export default async function route(app: FastifyInstance) {
    // Auth guard (simple API key)
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

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
        const res = await index.search(q, {
            limit,
            attributesToHighlight: ['content'],
            attributesToCrop: ['content'],
            cropLength: 60
        });
        return {
            hits: res.hits.map((h: any) => {
                let snippet: string | undefined = h._formatted?.content;
                if (!snippet && typeof h.content === 'string') {
                    const lc = h.content.toLowerCase();
                    const lq = q.toLowerCase();
                    const idx = lc.indexOf(lq);
                    if (idx !== -1) {
                        const start = Math.max(0, idx - 30);
                        snippet = h.content.slice(start, idx + lq.length + 30);
                    } else {
                        snippet = h.content.slice(0, 60);
                    }
                }
                return {
                    path: decodePath(h.path),
                    title: h.title,
                    snippet,
                    score: h._matchesPosition ? Object.keys(h._matchesPosition).length : undefined
                };
            })
        };
    });
}