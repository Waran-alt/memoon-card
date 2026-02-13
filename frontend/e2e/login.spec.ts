import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';

function createCredentials() {
  return {
    email: uniqueTestEmail(),
    password: testPassword,
  };
}

test('register, sign out, then sign in', async ({ page }) => {
  const { email, password } = createCredentials();

  // Register
  await page.goto('/register');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByLabel(/Username/).fill('E2E Login User');
  await page.getByRole('button', { name: 'Create account' }).click();
  const myDecks = page.getByRole('heading', { name: 'My decks' });
  const regFailed = page.getByText('Registration failed');
  const signInHeading = page.getByRole('heading', { name: 'Sign in' });
  await expect(myDecks.or(regFailed).or(signInHeading)).toBeVisible({ timeout: 10_000 });
  if (await regFailed.isVisible()) {
    const msg = await regFailed.textContent();
    throw new Error(
      `Registration failed: ${msg?.trim() ?? 'unknown'}. If you use the app at https://memoon-card.localhost, E2E at http://localhost:3002 is cross-origin: ensure backend CORS allows http://localhost:3002 (e.g. CORS_ORIGINS="https://memoon-card.localhost,http://localhost:3002") or run with E2E_BASE_URL=https://memoon-card.localhost.`
    );
  }
  if (await signInHeading.isVisible()) {
    throw new Error(
      'After register we landed on Sign in. The refresh cookie is likely set for a different origin. When using E2E_BASE_URL=https://memoon-card.localhost, run the frontend with NEXT_PUBLIC_API_URL="" (empty) so API calls are same-origin and the cookie is set for that host; then restart the dev server and re-run the test.'
    );
  }
  await expect(myDecks).toBeVisible();

  // Sign out (in app shell)
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Sign in with same credentials
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();
});
