/**
 * Public version string for GET /api/version. Never expose a bare git sha (short or full).
 */
import { readFileSync } from 'fs';
import path from 'path';

let cachedSemver: string | null = null;

function backendPackageSemver(): string {
  if (cachedSemver != null) return cachedSemver;
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    cachedSemver = JSON.parse(readFileSync(pkgPath, 'utf8')).version as string;
  } catch {
    cachedSemver = '0.0.0';
  }
  return cachedSemver;
}

/** Shorten full SHAs in labels (e.g. 1.0.1+deadbeef…40 → 1.0.1+deadbeef). */
export function normalizeVersionLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^[0-9a-f]{40}$/i.test(t)) return t.slice(0, 7);
  const plusIdx = t.indexOf('+');
  if (plusIdx !== -1) {
    const suffix = t.slice(plusIdx + 1);
    if (/^[0-9a-f]{8,}$/i.test(suffix)) {
      return `${t.slice(0, plusIdx)}+${suffix.slice(0, 7)}`;
    }
  }
  return t;
}

/** True if s is only a git object id (Hostinger / CI sometimes pass a 7-char short sha). */
function isBareGitSha(s: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(s);
}

/** Value for JSON `{ version }` from env (Hostinger often has GIT_SHA but missing APP_RELEASE). */
export function resolvePublicAppVersion(): string {
  const appRelease = process.env.APP_RELEASE?.trim();
  if (appRelease) {
    if (isBareGitSha(appRelease)) {
      return `${backendPackageSemver()}+${appRelease.slice(0, 7)}`;
    }
    return normalizeVersionLabel(appRelease);
  }
  const np = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (np) {
    if (isBareGitSha(np)) {
      return `${backendPackageSemver()}+${np.slice(0, 7)}`;
    }
    return normalizeVersionLabel(np);
  }
  const sha = process.env.GIT_SHA?.trim();
  if (sha && sha !== 'unknown') {
    if (isBareGitSha(sha)) {
      return `${backendPackageSemver()}+${sha.slice(0, 7)}`;
    }
    return normalizeVersionLabel(sha);
  }
  return 'dev';
}
