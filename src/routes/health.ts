import { FastifyInstance } from 'fastify';


export default async function route(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
    //console.log('[Health] endpoint hit at', new Date().toISOString());
    return { ok: true };
  });
}