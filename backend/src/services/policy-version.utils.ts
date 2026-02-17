import { ADAPTIVE_POLICY_VERSION } from '@/config/env';

const POLICY_VERSION_FALLBACK = 'baseline-v1';
const POLICY_VERSION_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

export function normalizePolicyVersion(raw: unknown): string {
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (!candidate || !POLICY_VERSION_PATTERN.test(candidate)) {
    return POLICY_VERSION_FALLBACK;
  }
  return candidate;
}

export function getDefaultPolicyVersion(): string {
  return normalizePolicyVersion(ADAPTIVE_POLICY_VERSION);
}

export function withPolicyVersionPayload(
  payload: unknown,
  policyVersion: string
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { policyVersion };
  }
  return {
    ...(payload as Record<string, unknown>),
    policyVersion,
  };
}
