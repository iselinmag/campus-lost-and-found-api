jest.mock('../src/db', () => ({
  query: jest.fn()
}));

jest.mock('../src/posthog', () => ({
  isFeatureEnabled: jest.fn()
}));

const pool = require('../src/db');
const posthog = require('../src/posthog');
const app = require('../src/server');
const { hashApiKey } = require('../src/apiKey');

describe('Campus Lost-and-Found API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  test('GET / returns API status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      message: 'Campus Lost-and-Found API is running'
    });
  });

  test('GET /items/:id rejects an invalid id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/items/abc'
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: 'Invalid item id'
    });
  });

  test('GET /items/:id returns 404 when item does not exist', async () => {
    pool.query.mockResolvedValue({
      rows: []
    });

    const response = await app.inject({
      method: 'GET',
      url: '/items/999'
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toEqual({
      error: 'Item not found'
    });
  });

  test('GET /items returns public list of items', async () => {
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          name: 'Black backpack'
        }
      ]
    });

    const response = await app.inject({
      method: 'GET',
      url: '/items'
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      page: 1,
      limit: 10,
      items: [
        {
          id: 1,
          name: 'Black backpack'
        }
      ]
    });
  });

  test('POST /items rejects request without API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        name: 'Phone',
        description: 'Lost near library',
        lost_date: '2026-09-04'
      }
    });

    expect(response.statusCode).toBe(401);

    expect(response.json()).toEqual({
      error: 'API key is required'
    });
  });

  test('GET /items search returns 503 when feature toggle is disabled', async () => {
    posthog.isFeatureEnabled.mockResolvedValue(false);

    const response = await app.inject({
      method: 'GET',
      url: '/items?search=backpack'
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      error: 'Full-text search is currently disabled'
    });
  });

  test('GET /db-test returns database connection status', async () => {
  pool.query.mockResolvedValue({
    rows: [{ now: '2026-09-04T12:00:00.000Z' }]
  });

  const response = await app.inject({
    method: 'GET',
    url: '/db-test'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    databaseConnected: true,
    time: '2026-09-04T12:00:00.000Z'
  });
});

test('authenticated endpoint rejects an invalid API key', async () => {
  pool.query.mockResolvedValue({
    rows: []
  });

  const response = await app.inject({
    method: 'POST',
    url: '/items',
    headers: {
      'x-api-key': 'invalid-key'
    },
    payload: {
      name: 'Phone',
      description: 'Lost near library',
      lost_date: '2026-09-04'
    }
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toEqual({
    error: 'Invalid API key'
  });
});

test('POST /items creates an item with a valid API key', async () => {
  const apiKey = 'valid-test-key';

  pool.query
    .mockResolvedValueOnce({
      rows: [{
        key_hash: hashApiKey(apiKey)
      }]
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 1,
        name: 'Phone',
        description: 'Lost near library',
        lost_date: '2026-09-04',
        metadata: null
      }]
    });

  const response = await app.inject({
    method: 'POST',
    url: '/items',
    headers: {
      'x-api-key': apiKey
    },
    payload: {
      name: 'Phone',
      description: 'Lost near library',
      lost_date: '2026-09-04'
    }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json()).toEqual({
    id: 1,
    name: 'Phone',
    description: 'Lost near library',
    lost_date: '2026-09-04',
    metadata: null
  });
});

test('POST /items rejects missing required fields', async () => {
  const apiKey = 'valid-test-key';

  pool.query.mockResolvedValueOnce({
    rows: [{
      key_hash: hashApiKey(apiKey)
    }]
  });

  const response = await app.inject({
    method: 'POST',
    url: '/items',
    headers: {
      'x-api-key': apiKey
    },
    payload: {
      name: 'Phone'
    }
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    error: 'name, description and lost_date are required'
  });
});

test('PUT /items/:id updates an item with a valid API key', async () => {
  const apiKey = 'valid-test-key';

  pool.query
    .mockResolvedValueOnce({
      rows: [{
        key_hash: hashApiKey(apiKey)
      }]
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 1,
        name: 'Updated backpack',
        description: 'Found near library',
        lost_date: '2026-09-04'
      }]
    });

  const response = await app.inject({
    method: 'PUT',
    url: '/items/1',
    headers: {
      'x-api-key': apiKey
    },
    payload: {
      name: 'Updated backpack'
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().name).toBe('Updated backpack');
});

test('DELETE /items/:id deletes an item with a valid API key', async () => {
  const apiKey = 'valid-test-key';

  pool.query
    .mockResolvedValueOnce({
      rows: [{
        key_hash: hashApiKey(apiKey)
      }]
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 1,
        name: 'Black backpack'
      }]
    });

  const response = await app.inject({
    method: 'DELETE',
    url: '/items/1',
    headers: {
      'x-api-key': apiKey
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    message: 'Item deleted',
    item: {
      id: 1,
      name: 'Black backpack'
    }
  });
});

test('POST /api-key/rotate returns a new API key', async () => {
  const apiKey = 'valid-test-key';

  pool.query
    .mockResolvedValueOnce({
      rows: [{
        key_hash: hashApiKey(apiKey)
      }]
    })
    .mockResolvedValueOnce({
      rows: []
    });

  const response = await app.inject({
    method: 'POST',
    url: '/api-key/rotate',
    headers: {
      'x-api-key': apiKey
    }
  });

  const body = response.json();

  expect(response.statusCode).toBe(200);
  expect(body.message).toBe('API key rotated successfully');
  expect(body.apiKey).toHaveLength(64);
  expect(body.apiKey).toMatch(/^[0-9a-f]+$/);
});

test('GET /items performs search when feature toggle is enabled', async () => {
  posthog.isFeatureEnabled.mockResolvedValue(true);

  pool.query.mockResolvedValue({
    rows: [{
      id: 1,
      name: 'Black backpack'
    }]
  });

  const response = await app.inject({
    method: 'GET',
    url: '/items?search=backpack&sort=oldest'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().items).toEqual([
    {
      id: 1,
      name: 'Black backpack'
    }
  ]);

  expect(posthog.isFeatureEnabled).toHaveBeenCalledWith(
    'is-full-text-search-enabled',
    'public-api'
  );
});
});