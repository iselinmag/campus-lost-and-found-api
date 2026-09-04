const fastify = require('fastify')({
  logger: true
});

const items = [
  {
    id: 1,
    name: 'Black Backpack',
    description: 'Found near the library',
    date: '2026-09-01'
  },
  {
    id: 2,
    name: 'AirPods',
    description: 'Found in classroom B204',
    date: '2026-09-02'
  }
];

fastify.get('/', async () => {
  return {
    message: 'Campus Lost-and-Found API is running'
  };
});

fastify.get('/items', async () => {
  return items;
});

fastify.get('/items/:id', async (request, reply) => {
  const id = Number(request.params.id);

  const item = items.find(item => item.id === id);

  if (!item) {
    return reply.code(404).send({
      error: 'Item not found'
    });
  }

  return item;
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