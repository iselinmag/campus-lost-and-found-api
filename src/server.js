const fastify = require('fastify')({
  logger: true
});

const pool = require('./db');

const posthog = require('./posthog');

const {
  generateApiKey,
  hashApiKey,
  apiKeysMatch
} = require('./apiKey');

async function requireApiKey(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    return reply.status(401).send({
      error: 'API key is required'
    });
  }

  const result = await pool.query(
    'SELECT key_hash FROM api_keys WHERE id = 1'
  );

  if (result.rows.length === 0) {
    return reply.status(401).send({
      error: 'Invalid API key'
    });
  }

  const isValid = apiKeysMatch(
    apiKey,
    result.rows[0].key_hash
  );

  if (!isValid) {
    return reply.status(401).send({
      error: 'Invalid API key'
    });
  }
}

fastify.post(
  '/api-key/rotate',
  { preHandler: requireApiKey },
  async (request, reply) => {
    const newApiKey = generateApiKey();
    const newKeyHash = hashApiKey(newApiKey);

    await pool.query(
      `UPDATE api_keys
       SET key_hash = $1,
           updated_at = NOW()
       WHERE id = 1`,
      [newKeyHash]
    );

    return reply.status(200).send({
      message: 'API key rotated successfully',
      apiKey: newApiKey
    });
  }
);

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

fastify.post('/items', { preHandler: requireApiKey }, async (request, reply) => {
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

if (search) {
  const searchEnabled = await posthog.isFeatureEnabled(
    'is-full-text-search-enabled',
    'public-api'
  );

  if (!searchEnabled) {
    return reply.status(503).send({
      error: 'Full-text search is currently disabled'
    });
  }
}

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

fastify.put('/items/:id', { preHandler: requireApiKey }, async (request, reply) => {
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

fastify.delete('/items/:id', { preHandler: requireApiKey }, async (request, reply) => {
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

if (require.main === module) {
  start();
}

module.exports = fastify;