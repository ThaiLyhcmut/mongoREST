async function adminRoutes(fastify, options) {
  const { authManager, dbManager, schemaLoader } = fastify;

  // Route to get server status
  fastify.get('/status', async (request, reply) => {
    return { status: 'ok' };
  });
}

export default adminRoutes;