const fastify = require('fastify')({
  logger: true
});

fastify.get('/', async (request, reply) => {
  return {
    message: 'Campus Lost-and-Found API is running'
  };
});

const start = async () => {
  try {
    await fastify.listen({
      port: 3000,
      host: '0.0.0.0'
    });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();