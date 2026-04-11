import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeVersionLabel, resolvePublicAppVersion } from '../version-display';

describe('version-display', () => {
  describe('normalizeVersionLabel', () => {
    it('shortens a 40-char hex sha', () => {
      expect(normalizeVersionLabel('a1b2c3d4e5f6789012345678901234567890abcd')).toBe('a1b2c3d');
    });

    it('shortens long hex after semver+', () => {
      expect(normalizeVersionLabel('1.0.1+a1b2c3d4e5f6789012345678901234567890abcd')).toBe('1.0.1+a1b2c3d');
    });

    it('leaves short labels unchanged', () => {
      expect(normalizeVersionLabel('1.0.1+abc12')).toBe('1.0.1+abc12');
      expect(normalizeVersionLabel('dev')).toBe('dev');
    });
  });

  describe('resolvePublicAppVersion', () => {
    const env = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...env };
      delete process.env.APP_RELEASE;
      delete process.env.NEXT_PUBLIC_APP_VERSION;
 delete process.env.GIT_SHA;
    });

    afterEach(() => {
      process.env = env;
    });

    it('prefers APP_RELEASE', () => {
      process.env.APP_RELEASE = '1.2.3+beef';
      expect(resolvePublicAppVersion()).toBe('1.2.3+beef');
    });

    it('prefixes semver when APP_RELEASE is only a short sha', () => {
      process.env.APP_RELEASE = '2378912';
      const v = resolvePublicAppVersion();
      expect(v).toMatch(/^[\d.]+[+][a-f0-9]{7}$/i);
      expect(v.endsWith('+2378912')).toBe(true);
    });

    it('builds semver+short from full GIT_SHA when release vars missing', () => {
      process.env.GIT_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const v = resolvePublicAppVersion();
      expect(v).toMatch(/^[\d.]+[+][a-f0-9]{7}$/i);
      expect(v.endsWith('+a1b2c3d')).toBe(true);
    });

    it('builds semver+short from 7-char GIT_SHA when release vars missing', () => {
      process.env.GIT_SHA = '2378912';
      const v = resolvePublicAppVersion();
      expect(v).toMatch(/^[\d.]+[+][a-f0-9]{7}$/i);
      expect(v.endsWith('+2378912')).toBe(true);
    });
  });
});
