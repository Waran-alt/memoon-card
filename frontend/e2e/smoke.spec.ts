/**
 * E2E: Minimal path register → deck → card → study (grid 9.3).
 */
import { expect, test } from '@playwright/test';
import { testPassword, uniqueTestEmail } from './config';
import { c, a, E2E_LOCALE_PREFIX } from './i18n';
import { expectMyDecksHeading, studyRevealQuestionAndAnswer } from './helpers';

test('smoke: register, create deck/card, open study', async ({ page }) => {
  const email = uniqueTestEmail();

  await page.goto(`${E2E_LOCALE_PREFIX}/register`);
  await page.getByLabel(c('email')).fill(email);
  await page.getByLabel(/Password/).fill(testPassword);
  await page.getByLabel(c('usernameOptional')).fill('E2E User');
  await page.getByRole('button', { name: c('createAccount') }).click();

  await expect(page).toHaveURL(/\/en\/app/);
  await expectMyDecksHeading(page);

  const deckTitle = `E2E Deck ${Date.now()}`;
  await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
  await page.locator('#deck-title').fill(deckTitle);
  await page.locator('#deck-description').fill('Smoke test deck');
  await page.getByRole('button', { name: c('create'), exact: true }).click();

  await expect(page.getByRole('link', { name: deckTitle })).toBeVisible();
  await page.getByRole('link', { name: deckTitle }).click();
  await expect(page).toHaveURL(/\/en\/app\/decks\/.+/);

  await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
  await page.locator('#card-recto').fill('What is 2 + 2?');
  await page.locator('#card-verso').fill('4');
  await page.getByRole('button', { name: c('create'), exact: true }).click();
  await expect(page.getByText('What is 2 + 2?')).toBeVisible();

  await page.getByRole('link', { name: a('study'), exact: true }).click();
  await expect(page).toHaveURL(/\/study$/);
  await studyRevealQuestionAndAnswer(page);
  await expect(page.getByRole('button', { name: a('good') })).toBeVisible();
});
