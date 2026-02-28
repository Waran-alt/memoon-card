/**
 * Deletes all users whose email ends with @test.local (E2E test accounts).
 * All related data is removed by DB CASCADE. Run after E2E tests to clean up.
 *
 * Usage (from repo root): node backend/scripts/e2e-cleanup.js
 * Or: yarn workspace @memoon-card/backend node scripts/e2e-cleanup.js
 *
 * Requires: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 * in .env (root or backend/.env).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "DELETE FROM users WHERE email LIKE '%@test.local' RETURNING id"
    );
    const count = res.rowCount ?? 0;
    console.log(`e2e-cleanup: deleted ${count} user(s) with email @test.local`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('e2e-cleanup failed:', err.message);
  process.exit(1);
});
