/**
 * Deletes users with email LIKE '%@test.local' (E2E). CASCADE removes dependent rows.
 * Fixed SQL pattern only — no CLI args, no dynamic concatenation from user input.
 *
 * Usage: node backend/scripts/e2e-cleanup.js (repo root) or yarn workspace @memoon-card/backend node scripts/e2e-cleanup.js
 *
 * Requires POSTGRES_* in .env. Avoid running against production unless you intend to remove test accounts only.
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
