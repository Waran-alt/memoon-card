import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';

function createCredentials() {
  return {
    email: uniqueTestEmail(),
    password: testPassword,
  };
}

test.describe('Landing and auth gates', () => {
  test('landing page shows Create account and Sign in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'MemoOn Card' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('unauthenticated visit to /app redirects to Sign in', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to /app/decks/any-id redirects to Sign in', async ({ page }) => {
    await page.goto('/app/decks/some-id');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('register with short password is blocked (native or app validation)', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(uniqueTestEmail());
    await page.getByLabel(/Password/).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    // Input has minLength=8 so browser blocks submit; we stay on register (no React error text in DOM)
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    const { email, password } = createCredentials();

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill('WrongPassword1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid|password|login failed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('logged-in user visiting / is redirected to My decks', async ({ page }) => {
    const { email, password } = createCredentials();
    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();
    await expect(page).toHaveURL(/\/app/);
  });

  test('navigate between login and register', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Register' }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
