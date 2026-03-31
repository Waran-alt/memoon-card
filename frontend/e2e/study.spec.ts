/**
 * E2E: Deck/card creation and study ratings against running stack.
 */
import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';
import { c, a, E2E_LOCALE_PREFIX, reviewedCountLine } from './i18n';
import { expectMyDecksHeading, studyRevealQuestionAndAnswer } from './helpers';

function createCredentials() {
  return {
    email: uniqueTestEmail(),
    password: testPassword,
  };
}

test.describe('Study flow', () => {
  test('register, create deck/card, and study', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;
    const recto = 'Front text';
    const verso = 'Back text';

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByLabel(/Username/).fill('E2E User');
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
    await page.getByLabel(a('recto')).fill(recto);
    await page.getByLabel(a('verso')).fill(verso);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByText(recto)).toBeVisible();
    await expect(page.getByText(verso)).toBeVisible();

    await page.getByRole('link', { name: a('study'), exact: true }).click();
    await studyRevealQuestionAndAnswer(page);
    await expect(page.getByText(recto)).toBeVisible();
    await expect(page.getByText(verso)).toBeVisible();
    await page.getByRole('button', { name: a('good') }).click();
    await expect(page.getByText(a('sessionComplete'))).toBeVisible();
  });

  test('study deck with no cards shows empty state', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('link', { name: deckTitle }).click();
    await page.getByRole('link', { name: a('study'), exact: true }).click();

    await expect(page.getByText(a('noCardsToStudy'))).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: new RegExp(a('backToDeck')) })
    ).toBeVisible();
  });

  test('study with two cards and different ratings', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;
    const front1 = 'First card front';
    const back1 = 'First card back';
    const front2 = 'Second card front';
    const back2 = 'Second card back';

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await page.getByRole('link', { name: deckTitle }).click();

    await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
    await page.getByLabel(a('recto')).fill(front1);
    await page.getByLabel(a('verso')).fill(back1);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
    await page.getByLabel(a('recto')).fill(front2);
    await page.getByLabel(a('verso')).fill(back2);
    await page.getByRole('button', { name: c('create'), exact: true }).click();

    await page.getByRole('link', { name: a('study'), exact: true }).click();
    await studyRevealQuestionAndAnswer(page);
    // Queue order is shuffled on the study page; accept either card first.
    const front1Loc = page.getByText(front1);
    const front2Loc = page.getByText(front2);
    await expect(front1Loc.or(front2Loc)).toBeVisible();
    const firstWasFront1 = await front1Loc.isVisible();
    await page.getByRole('button', { name: a('again') }).click();

    await studyRevealQuestionAndAnswer(page);
    if (firstWasFront1) {
      await expect(front2Loc).toBeVisible();
    } else {
      await expect(front1Loc).toBeVisible();
    }
    await page.getByRole('button', { name: a('easy') }).click();

    await expect(page.getByText(a('sessionComplete'))).toBeVisible();
    await expect(page.getByText(reviewedCountLine(2))).toBeVisible();
  });

  test('exit study returns to deck', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(deckTitle);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await page.getByRole('link', { name: deckTitle }).click();

    await page.getByRole('button', { name: new RegExp(`^${a('newCard')}$`) }).first().click();
    await page.getByLabel(a('recto')).fill('Q');
    await page.getByLabel(a('verso')).fill('A');
    await page.getByRole('button', { name: c('create'), exact: true }).click();

    await page.getByRole('link', { name: a('study'), exact: true }).click();
    await page.getByRole('button', { name: a('showQuestion') }).click();
    await expect(page.getByText('Q', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(a('exitStudy')) }).click();

    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: a('study'), exact: true })).toBeVisible();
  });

  test('two decks appear on My decks and Back to decks returns to list', async ({ page }) => {
    const { email, password } = createCredentials();
    const title1 = `Deck A ${Date.now()}`;
    const title2 = `Deck B ${Date.now()}`;

    await page.goto(`${E2E_LOCALE_PREFIX}/register`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: c('createAccount') }).click();
    await expectMyDecksHeading(page);

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(title1);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByRole('link', { name: title1 })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`^${c('newDeck')}$`) }).first().click();
    await page.getByLabel(a('title')).fill(title2);
    await page.getByRole('button', { name: c('create'), exact: true }).click();
    await expect(page.getByRole('link', { name: title2 })).toBeVisible();

    await page.getByRole('link', { name: title1 }).click();
    await expect(page.getByRole('heading', { name: title1 })).toBeVisible();
    // AppLayoutShell uses "← {backToDecks}"; accessible name is not exact "Back to decks".
    await page.getByRole('link', { name: new RegExp(a('backToDecks')) }).first().click();
    await expectMyDecksHeading(page);
    await expect(page.getByRole('link', { name: title1 })).toBeVisible();
  });
});
