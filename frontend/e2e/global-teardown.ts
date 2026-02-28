/**
 * Playwright global teardown: delete E2E test users (email @test.local) from the database.
 * Requires DB env (POSTGRES_*) in .env. Failures are logged but do not fail the test run.
 */
import { execSync } from 'child_process';
import path from 'path';

export default async function globalTeardown() {
  const root = path.resolve(__dirname, '../..');
  try {
    execSync('node backend/scripts/e2e-cleanup.js', {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[e2e teardown] e2e:cleanup failed (non-fatal):', msg);
  }
}
