import { FastifyInstance } from 'fastify';


export default async function route(app: FastifyInstance) {
    app.get('/health', async () => ({ ok: true }));
}