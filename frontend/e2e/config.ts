export const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
export const testEmail = process.env.E2E_TEST_EMAIL || 'e2e@test.local';

/**
 * E2E test users use emails like e2e+<seed>@test.local. To delete all data created by E2E tests:
 * - After a run: yarn e2e:cleanup (from repo root). Deletes all users WHERE email LIKE '%@test.local'.
 * - Teardown: Playwright globalTeardown runs the same cleanup automatically (non-fatal if DB unavailable).
 */

export function uniqueTestEmail(): string {
  const seed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [name, domain] = testEmail.split('@');
  if (!name || !domain) return `e2e-${seed}@test.local`;
  return `${name}+${seed}@${domain}`;
}
