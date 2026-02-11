import { expect, test } from '@playwright/test';
import { testPassword, uniqueTestEmail } from './config';

test('smoke: register, create deck/card, open study', async ({ page }) => {
  const email = uniqueTestEmail();

  await page.goto('/en/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Password/).fill(testPassword);
  await page.getByLabel('Username (optional)').fill('E2E User');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/en\/app/);
  await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

  const deckTitle = `E2E Deck ${Date.now()}`;
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.locator('#deck-title').fill(deckTitle);
  await page.locator('#deck-description').fill('Smoke test deck');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: deckTitle })).toBeVisible();
  await page.getByRole('link', { name: deckTitle }).click();
  await expect(page).toHaveURL(/\/en\/app\/decks\/.+/);

  await page.getByRole('button', { name: 'New card' }).click();
  await page.locator('#card-recto').fill('What is 2 + 2?');
  await page.locator('#card-verso').fill('4');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('What is 2 + 2?')).toBeVisible();

  await page.getByRole('link', { name: 'Study' }).click();
  await expect(page).toHaveURL(/\/study$/);
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
});
