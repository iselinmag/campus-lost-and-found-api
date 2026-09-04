const pool = require('../src/db');
const { generateApiKey, hashApiKey } = require('../src/apiKey');

async function createInitialApiKey() {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  await pool.query(
    `INSERT INTO api_keys (id, key_hash)
     VALUES (1, $1)
     ON CONFLICT (id)
     DO UPDATE SET
       key_hash = EXCLUDED.key_hash,
       updated_at = NOW()`,
    [keyHash]
  );

  console.log('\nAPI key created successfully.');
  console.log('Save this key now. It will only be shown here:\n');
  console.log(apiKey);
  console.log();

  await pool.end();
}

createInitialApiKey().catch(async (error) => {
  console.error('Failed to create API key:', error);
  await pool.end();
  process.exit(1);
});