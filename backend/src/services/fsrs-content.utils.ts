/**
 * Card recto/verso text diff (Levenshtein) to decide FSRS reset on large edits. HTML should be sanitized before storage (sanitize.ts).
 */
import { CONTENT_CHANGE_THRESHOLDS } from '@/constants/app.constants';

export interface ContentChangeResult {
  changePercent: number;
  isSignificant: boolean;
  shouldReset: boolean;
}

export function detectContentChange(oldContent: string, newContent: string): ContentChangeResult {
  if (oldContent === newContent) {
    return { changePercent: 0, isSignificant: false, shouldReset: false };
  }

  const maxLength = Math.max(oldContent.length, newContent.length);
  if (maxLength === 0) {
    return { changePercent: 0, isSignificant: false, shouldReset: false };
  }

  const distance = levenshteinDistance(oldContent, newContent);
  const similarity = 1 - distance / maxLength;
  const changePercent = (1 - similarity) * 100;

  return {
    changePercent,
    isSignificant: changePercent > CONTENT_CHANGE_THRESHOLDS.SIGNIFICANT,
    shouldReset: changePercent > CONTENT_CHANGE_THRESHOLDS.RESET,
  };
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      matrix[i][j] =
        str2.charAt(i - 1) === str1.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[str2.length][str1.length];
}
