/**
 * E2E: Deck detail page behaviour (authenticated).
 */
import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';
import { c, a, E2E_LOCALE_PREFIX } from './i18n';
import { expectMyDecksHeading } from './helpers';

test.describe('Deck detail: card list and card details modal', () => {
  test('opens card details modal and shows FSRS section', async ({ page }) => {
    const email = uniqueTestEmail();
    const deckTitle = `E2E Deck ${Date.now()}`;
    const recto = 'Card front for details';
    const verso = 'Card back for details';

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(c('email')).fill(email);
    await page.getByLabel(/Password/).fill(testPassword);
    await page.getByLabel(c('usernameOptional')).fill('E2E User');
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByRole('link', { name: deckTitle })).toBeVisible();

    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
    await page.getByLabel(a('recto')).fill(recto);
    await page.getByLabel(a('verso')).fill(verso);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByText(recto)).toBeVisible();

    await page.getByRole('button', { name: a('cardDetailsButton') }).first().click();
    await expect(page.getByRole('dialog').getByText(a('cardDetailsTitle'))).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: a('cardDetailsLongFsrs') })
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /close/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('edit deck opens modal with title and categories section', async ({ page }) => {
    const email = uniqueTestEmail();
    const deckTitle = `E2E Deck Edit ${Date.now()}`;

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(c('email')).fill(email);
    await page.getByLabel(/Password/).fill(testPassword);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('button', { name: a('editDeck') }).click();
    await expect(page.getByRole('dialog').getByText(a('editDeckTitle'))).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel(a('title'))).toHaveValue(deckTitle);
    await expect(
      page.getByRole('dialog').getByText(a('editDeckCategoriesLabel'), { exact: true }).first()
    ).toBeVisible();
    await page.getByRole('button', { name: c('cancel') }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
