const fastify = require('fastify')({
  logger: true
});

const pool = require('./db');

fastify.get('/', async (request, reply) => {
  return {
    message: 'Campus Lost-and-Found API is running'
  };
});

fastify.get('/db-test', async (request, reply) => {
  const result = await pool.query('SELECT NOW()');

  return {
    databaseConnected: true,
    time: result.rows[0].now
  };
});

fastify.post('/items', async (request, reply) => {
  const { name, description, lost_date, metadata } = request.body;

  if (!name || !description || !lost_date) {
    return reply.status(400).send({
      error: 'name, description and lost_date are required'
    });
  }

  const result = await pool.query(
    `INSERT INTO items (name, description, lost_date, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, description, lost_date, metadata || null]
  );

  return reply.status(201).send(result.rows[0]);
});

fastify.get('/items', async (request, reply) => {
  const page = Math.max(parseInt(request.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(request.query.limit) || 10, 1), 100);

  const sort =
    request.query.sort === 'oldest'
      ? 'ASC'
      : 'DESC';

  const search = request.query.search || '';
  const offset = (page - 1) * limit;

  let result;

  if (search) {
    result = await pool.query(
      `SELECT *
       FROM items
       WHERE to_tsvector('english', name || ' ' || description)
       @@ plainto_tsquery('english', $1)
       ORDER BY created_at ${sort}
       LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );
  } else {
    result = await pool.query(
      `SELECT *
       FROM items
       ORDER BY created_at ${sort}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  return {
    page,
    limit,
    items: result.rows
  };
});

fastify.get('/items/:id', async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({
      error: 'Invalid item id'
    });
  }

  const result = await pool.query(
    'SELECT * FROM items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return reply.status(404).send({
      error: 'Item not found'
    });
  }

  return result.rows[0];
});

fastify.put('/items/:id', async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({
      error: 'Invalid item id'
    });
  }

  const { name, description, lost_date, metadata } = request.body;

  const result = await pool.query(
    `UPDATE items
     SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       lost_date = COALESCE($3, lost_date),
       metadata = COALESCE($4, metadata),
       updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      name || null,
      description || null,
      lost_date || null,
      metadata || null,
      id
    ]
  );

  if (result.rows.length === 0) {
    return reply.status(404).send({
      error: 'Item not found'
    });
  }

  return result.rows[0];
});

fastify.delete('/items/:id', async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return reply.status(400).send({
      error: 'Invalid item id'
    });
  }

  const result = await pool.query(
    'DELETE FROM items WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return reply.status(404).send({
      error: 'Item not found'
    });
  }

  return {
    message: 'Item deleted',
    item: result.rows[0]
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