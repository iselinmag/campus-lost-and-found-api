const {
  generateApiKey,
  hashApiKey,
  apiKeysMatch
} = require('../src/apiKey');

describe('API key utilities', () => {
  test('generateApiKey returns a 64 character hexadecimal string', () => {
    const apiKey = generateApiKey();

    expect(apiKey).toHaveLength(64);
    expect(apiKey).toMatch(/^[0-9a-f]+$/);
  });

  test('generateApiKey creates different keys', () => {
    const firstKey = generateApiKey();
    const secondKey = generateApiKey();

    expect(firstKey).not.toBe(secondKey);
  });

  test('hashApiKey returns the same hash for the same API key', () => {
    const apiKey = 'test-api-key';

    const firstHash = hashApiKey(apiKey);
    const secondHash = hashApiKey(apiKey);

    expect(firstHash).toBe(secondHash);
  });

  test('hashApiKey returns a 64 character hexadecimal hash', () => {
    const hash = hashApiKey('test-api-key');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  test('apiKeysMatch accepts the correct API key', () => {
    const apiKey = 'correct-api-key';
    const storedHash = hashApiKey(apiKey);

    expect(apiKeysMatch(apiKey, storedHash)).toBe(true);
  });

  test('apiKeysMatch rejects an incorrect API key', () => {
    const storedHash = hashApiKey('correct-api-key');

    expect(apiKeysMatch('wrong-api-key', storedHash)).toBe(false);
  });
});