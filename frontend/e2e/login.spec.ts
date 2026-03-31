/**
 * E2E: Register → logout → login flow; credentials from config.
 */
import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';
import { c, E2E_LOCALE_PREFIX } from './i18n';
import { expectMyDecksHeading } from './helpers';

function createCredentials() {
  return {
    email: uniqueTestEmail(),
    password: testPassword,
  };
}

test('register, sign out, then sign in', async ({ page }) => {
  const { email, password } = createCredentials();

  await page.goto(`${E2E_LOCALE_PREFIX}/register`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByLabel(/Username/).fill('E2E Login User');
  await page.getByRole('button', { name: c('createAccount') }).click();
  const myDecks = page.getByRole('heading', { name: c('myDecks') });
  const regFailed = page.getByText(c('registrationFailed'));
  const signInHeading = page.getByRole('heading', { name: c('signIn') });
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
  await expectMyDecksHeading(page);

  await page.getByRole('button', { name: c('signOut') }).click();
  await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();

  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole('button', { name: c('signIn') }).click();
  await expectMyDecksHeading(page);
});
