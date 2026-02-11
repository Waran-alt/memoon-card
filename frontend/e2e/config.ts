export const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
export const testEmail = process.env.E2E_TEST_EMAIL || 'e2e@test.local';

export function uniqueTestEmail(): string {
  const seed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [name, domain] = testEmail.split('@');
  if (!name || !domain) return `e2e-${seed}@test.local`;
  return `${name}+${seed}@${domain}`;
}
