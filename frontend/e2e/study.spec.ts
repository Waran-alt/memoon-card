import { test, expect } from '@playwright/test';
import { uniqueTestEmail, testPassword } from './config';

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

    // Register (form: Email, Password, Username optional; no confirm password)
    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByLabel(/Username/).fill('E2E User');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    // Create deck (two "New deck" buttons on My decks page; either opens the same flow)
    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    // Enter deck
    await page.getByRole('link', { name: deckTitle }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    // Create card (two "New card" buttons on deck page; either opens the same flow)
    await page.getByRole('button', { name: /New card/ }).first().click();
    await page.getByLabel('Front (recto)').fill(recto);
    await page.getByLabel('Back (verso)').fill(verso);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(recto)).toBeVisible();
    await expect(page.getByText(verso)).toBeVisible();

    // Study
    await page.getByRole('link', { name: 'Study' }).click();
    await expect(page.getByText(recto)).toBeVisible();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByText(verso)).toBeVisible();
    await page.getByRole('button', { name: 'Good' }).click();
    await expect(page.getByText(/Session complete/)).toBeVisible();
  });

  test('study deck with no cards shows empty state', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();

    await page.getByRole('link', { name: deckTitle }).click();
    await page.getByRole('link', { name: 'Study' }).click();

    await expect(page.getByText(/No cards to study/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to deck/ }).first()).toBeVisible();
  });

  test('study with two cards and different ratings', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;
    const front1 = 'First card front';
    const back1 = 'First card back';
    const front2 = 'Second card front';
    const back2 = 'Second card back';

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: deckTitle }).click();

    await page.getByRole('button', { name: /New card/ }).first().click();
    await page.getByLabel('Front (recto)').fill(front1);
    await page.getByLabel('Back (verso)').fill(back1);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: /New card/ }).first().click();
    await page.getByLabel('Front (recto)').fill(front2);
    await page.getByLabel('Back (verso)').fill(back2);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('link', { name: 'Study' }).click();
    await expect(page.getByText(front1)).toBeVisible();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Again' }).click();

    await expect(page.getByText(front2)).toBeVisible();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Easy' }).click();

    await expect(page.getByText(/Session complete/)).toBeVisible();
    await expect(page.getByText(/2 cards/)).toBeVisible();
  });

  test('exit study returns to deck', async ({ page }) => {
    const { email, password } = createCredentials();
    const deckTitle = `Deck ${Date.now()}`;

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(deckTitle);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: deckTitle }).click();

    await page.getByRole('button', { name: /New card/ }).first().click();
    await page.getByLabel('Front (recto)').fill('Q');
    await page.getByLabel('Back (verso)').fill('A');
    await page.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('link', { name: 'Study' }).click();
    await expect(page.getByText('Q')).toBeVisible();
    await page.getByRole('link', { name: '← Exit study' }).click();

    await expect(page.getByRole('heading', { name: deckTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Study' })).toBeVisible();
  });

  test('two decks appear on My decks and Back to decks returns to list', async ({ page }) => {
    const { email, password } = createCredentials();
    const title1 = `Deck A ${Date.now()}`;
    const title2 = `Deck B ${Date.now()}`;

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();

    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(title1);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('link', { name: title1 })).toBeVisible();

    await page.getByRole('button', { name: /New deck/ }).first().click();
    await page.getByLabel('Title').fill(title2);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('link', { name: title2 })).toBeVisible();

    await page.getByRole('link', { name: title1 }).click();
    await expect(page.getByRole('heading', { name: title1 })).toBeVisible();
    await page.getByRole('link', { name: '← Back to decks' }).click();
    await expect(page.getByRole('heading', { name: 'My decks' })).toBeVisible();
    await expect(page.getByRole('link', { name: title1 })).toBeVisible();
  });
});
