import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';

test.describe('Deck detail: card list and card details modal', () => {
  test('opens card details modal and shows FSRS section', async ({ page }) => {
    const email = uniqueTestEmail();
    const deckTitle = `E2E Deck ${Date.now()}`;
    const recto = 'Card front for details';
    const verso = 'Card back for details';

    await page.goto('/en/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/Password/).fill(testPassword);
    await page.getByLabel('Username (optional)').fill('E2E User');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('link', { name: deckTitle })).toBeVisible();

    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('button', { name: /New card/ }).first().click();
    await page.getByLabel('Front (recto)').fill(recto);
    await page.getByLabel('Back (verso)').fill(verso);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(recto)).toBeVisible();

    await page.getByRole('button', { name: 'View details' }).first().click();
    await expect(page.getByRole('dialog').getByText('Card data & prediction')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText(/Short-FSRS \(learning\)|FSRS \(graduated\)/)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('edit deck opens modal with title and categories section', async ({ page }) => {
    const email = uniqueTestEmail();
    const deckTitle = `E2E Deck Edit ${Date.now()}`;

    await page.goto('/en/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/Password/).fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('button', { name: 'Edit deck' }).click();
    await expect(page.getByRole('dialog').getByText('Edit deck')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Title')).toHaveValue(deckTitle);
    await expect(page.getByRole('dialog').getByText('Categories')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
