/**
 * Lightweight client-side password strength hint. NOT a security gate — the backend always
 * enforces the canonical policy. The score is a coarse 0–4 derived from common heuristics
 * (length tier, character class diversity); we deliberately avoid heavy libraries here so the
 * register / reset / change-password forms stay snappy.
 *
 * Rendering:
 *   - segmented bar (4 cells) lit up to `score`,
 *   - tier label ("Weak"/"Fair"/"Good"/"Strong"),
 *   - requirements list with check/cross marks so users see what's missing.
 *
 * Hidden when `password` is empty (no chrome on a pristine field).
 */

import { Check, X } from 'lucide-react';

import type { TranslationFunction } from '@/hooks/useTranslation';

export type PasswordStrengthMeterProps = {
  password: string;
  minLength: number;
  /** Translator: passes through your common.json `t()` so labels stay localized. */
  t: TranslationFunction;
};

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export type PasswordStrengthDetails = {
  score: PasswordStrengthScore;
  meetsMinLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
  isLong: boolean;
};

export function computePasswordStrength(password: string, minLength: number): PasswordStrengthDetails {
  const meetsMinLength = password.length >= minLength;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const isLong = password.length >= Math.max(minLength + 4, 12);

  // Score = how many "strength signals" we have, capped at 4.
  let raw = 0;
  if (meetsMinLength) raw += 1;
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  raw += Math.min(classes, 3);
  if (isLong) raw += 1;
  // If the min length isn't met, force the lowest tier so users know it's not acceptable yet.
  if (!meetsMinLength) raw = Math.min(raw, 1);
  const score = Math.max(0, Math.min(4, raw)) as PasswordStrengthScore;

  return { score, meetsMinLength, hasLower, hasUpper, hasDigit, hasSymbol, isLong };
}

const TIER_LABEL_KEYS: Record<PasswordStrengthScore, string> = {
  0: 'passwordStrengthVeryWeak',
  1: 'passwordStrengthWeak',
  2: 'passwordStrengthFair',
  3: 'passwordStrengthGood',
  4: 'passwordStrengthStrong',
};

const TIER_COLOR: Record<PasswordStrengthScore, string> = {
  0: 'bg-(--mc-accent-danger)',
  1: 'bg-(--mc-accent-danger)',
  2: 'bg-(--mc-accent-warning)',
  3: 'bg-(--mc-accent-success)',
  4: 'bg-(--mc-accent-success)',
};

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? Check : X;
  const color = ok ? 'text-(--mc-accent-success)' : 'text-(--mc-text-muted)';
  return (
    <li className={`flex items-center gap-1 ${color}`}>
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span>{label}</span>
    </li>
  );
}

export function PasswordStrengthMeter({ password, minLength, t }: PasswordStrengthMeterProps) {
  if (!password) return null;
  const details = computePasswordStrength(password, minLength);
  const { score } = details;
  const lit = score === 0 ? 1 : score; // always show at least one filled cell so the bar isn't invisible.
  return (
    <div className="mt-1 space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((cell) => (
            <div
              key={cell}
              className={`h-full flex-1 rounded-full ${cell <= lit ? TIER_COLOR[score] : 'bg-(--mc-border-subtle)'}`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-(--mc-text-secondary)">{t(TIER_LABEL_KEYS[score])}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <Requirement ok={details.meetsMinLength} label={t('passwordHintMinLength', { vars: { count: minLength } })} />
        <Requirement ok={details.hasUpper && details.hasLower} label={t('passwordHintMixCase')} />
        <Requirement ok={details.hasDigit} label={t('passwordHintDigit')} />
        <Requirement ok={details.hasSymbol} label={t('passwordHintSymbol')} />
      </ul>
    </div>
  );
}
