/**
 * Session size presets for study: one card, small, medium, large.
 * Used for initial session limit and for "extend session" at session end.
 */
export type SessionSizeKey = 'one' | 'small' | 'medium' | 'large';

export const SESSION_SIZE_LIMITS: Record<SessionSizeKey, number> = {
  one: 1,
  small: 5,
  medium: 20,
  large: 50,
};

export const DEFAULT_SESSION_SIZE: SessionSizeKey = 'medium';

const VALID_KEYS: SessionSizeKey[] = ['one', 'small', 'medium', 'large'];

export function parseSessionSize(value: string | null): SessionSizeKey {
  if (value && VALID_KEYS.includes(value as SessionSizeKey)) {
    return value as SessionSizeKey;
  }
  return DEFAULT_SESSION_SIZE;
}

export function getSessionLimit(size: SessionSizeKey): number {
  return SESSION_SIZE_LIMITS[size];
}
