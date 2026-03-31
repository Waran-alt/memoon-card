/**
 * E2E: Landing, register/login gates, redirects (grid 9.3).
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

test.describe('Landing and auth gates', () => {
  test('landing page shows Create account and Sign in', async ({ page }) => {
    await page.goto(`${E2E_LOCALE_PREFIX}/`);
    await expect(page.getByRole('heading', { name: c('appName') })).toBeVisible();
    await expect(page.getByRole('link', { name: c('createAccount') })).toBeVisible();
    await expect(page.getByRole('link', { name: c('signIn') })).toBeVisible();
  });

  test('unauthenticated visit to /app redirects to Sign in', async ({ page }) => {
    await page.goto(`${E2E_LOCALE_PREFIX}/app`);
    await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to /app/decks/any-id redirects to Sign in', async ({ page }) => {
    await page.goto(`${E2E_LOCALE_PREFIX}/app/decks/some-id`);
    await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('register with short password is blocked (native or app validation)', async ({ page }) => {
    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(uniqueTestEmail());
    await page.getByLabel(/Password/).fill('short');
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expect(page.getByRole('heading', { name: c('createAccount') })).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    const { email, password } = createCredentials();

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: c('signOut') }).click();
    await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();

    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill('WrongPassword1!');
    await page.getByRole('button', { name: c('signIn') }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid|password|login failed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();
  });

  test('logged-in user visiting / is redirected to My decks', async ({ page }) => {
    const { email, password } = createCredentials();
    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.goto(`${E2E_LOCALE_PREFIX}/`);
    await expectMyDecksHeading(page);
    await expect(page).toHaveURL(/\/app/);
  });

  test('navigate between login and register', async ({ page }) => {
    await page.goto(`${E2E_LOCALE_PREFIX}/login`);
    await page.getByRole('link', { name: c('register') }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: c('createAccount') })).toBeVisible();

    await page.getByRole('link', { name: c('signIn') }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: c('signIn') })).toBeVisible();
  });
});
