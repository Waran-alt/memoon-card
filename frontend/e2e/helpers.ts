/**
 * Playwright helpers; strings via e2e/i18n.ts and public/locales (grid 4.7).
 */
import { expect, type Page } from '@playwright/test';
import { a, c } from './i18n';

/**
 * Authenticated app home (heading in AppLayoutShell). Does not wait on
 * data-e2e-shell-ready: that attribute exists only after /app shell mounts, so
 * failed signup on /register would otherwise time out with a misleading error.
 */
export async function expectMyDecksHeading(page: Page, timeout = 15_000) {
  await expect(page.getByRole('heading', { name: c('myDecks') })).toBeVisible({ timeout });
}

/** Study UI: question hidden until this, then answer (see study/page.tsx). */
export async function studyRevealQuestionAndAnswer(page: Page) {
  await page.getByRole('button', { name: a('showQuestion') }).click();
  await page.getByRole('button', { name: a('showAnswer') }).click();
}
