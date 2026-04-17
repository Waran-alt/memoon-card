/**
 * Tests for PasswordResetService in isolation.
 *
 * Why `vi.resetModules()` + `vi.doMock()` + dynamic `import()`?
 * - `password-reset.service.ts` reads `BREVO_*` and `NODE_ENV` from `@/config/env` at module load time
 *   (static import bindings). To assert different branches of `sendResetEmail`, we must reload the
 *   module after swapping env mocks.
 * - Mocks for `pool.query`, logger, and `sendBrevoTransactionalEmail` must be registered before each import.
 *
 * Order in each test: call `loadPasswordResetModule(opts)` first, then configure `queryMock` / `sendBrevoMock`
 * return values. `afterEach` resets spies so tests do not leak implementations.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

/** Stand-in for `pool.query` — all DB access in this service goes through this. */
const queryMock = vi.fn();
/** Replaces real Brevo HTTP call. */
const sendBrevoMock = vi.fn();
const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

/**
 * Loads a fresh copy of password-reset.service with the given env and mocked dependencies.
 * Always use this instead of a top-level static import when env varies per test.
 */
async function loadPasswordResetModule(opts: {
  NODE_ENV?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
}) {
  vi.resetModules();

  vi.doMock('@/config/database', () => ({ pool: { query: queryMock } }));
  vi.doMock('@/config/env', () => ({
    NODE_ENV: opts.NODE_ENV ?? 'test',
    BREVO_API_KEY: opts.BREVO_API_KEY,
    BREVO_SENDER_EMAIL: opts.BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME: opts.BREVO_SENDER_NAME,
  }));
  vi.doMock('@/utils/logger', () => ({
    logger: { info: loggerInfo, warn: loggerWarn, error: loggerError },
  }));
  vi.doMock('@/services/brevo-smtp.service', () => ({
    sendBrevoTransactionalEmail: sendBrevoMock,
  }));

  return import('@/services/password-reset.service');
}

afterEach(() => {
  queryMock.mockReset();
  sendBrevoMock.mockReset();
  loggerInfo.mockReset();
  loggerWarn.mockReset();
  loggerError.mockReset();
  vi.clearAllMocks();
});

describe('PasswordResetService', () => {
  it('createToken inserts hash and returns hex token', async () => {
    const { passwordResetService } = await loadPasswordResetModule({});
    queryMock.mockResolvedValueOnce({ rows: [] });
    const { token, expiresAt } = await passwordResetService.createToken('user-uuid', 60);
    // 32 bytes → 64 hex characters
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Third SQL arg must be the same Date instance returned to the caller (expiry alignment).
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO password_reset_tokens'),
      expect.arrayContaining(['user-uuid', expect.any(String), expiresAt])
    );
  });

  it('getUserIdForToken returns user id when row exists', async () => {
    const { passwordResetService } = await loadPasswordResetModule({});
    queryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
    const uid = await passwordResetService.getUserIdForToken('a'.repeat(64));
    expect(uid).toBe('u1');
  });

  it('getUserIdForToken returns null when no row', async () => {
    const { passwordResetService } = await loadPasswordResetModule({});
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await passwordResetService.getUserIdForToken('tok')).toBeNull();
  });

  it('invalidateAllActiveTokensForUser runs update', async () => {
    const { passwordResetService } = await loadPasswordResetModule({});
    queryMock.mockResolvedValueOnce({ rows: [] });
    await passwordResetService.invalidateAllActiveTokensForUser('u1');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE password_reset_tokens'),
      ['u1']
    );
  });

  it('consumeToken updates by token hash', async () => {
    const { passwordResetService } = await loadPasswordResetModule({});
    queryMock.mockResolvedValueOnce({ rows: [] });
    await passwordResetService.consumeToken('abc');
    // Arg is sha256 hex of plain token, not the plain token.
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE password_reset_tokens SET used_at'),
      [expect.any(String)]
    );
  });

  it('sendResetEmail calls Brevo when API key and sender are set', async () => {
    const { passwordResetService } = await loadPasswordResetModule({
      BREVO_API_KEY: 'key',
      BREVO_SENDER_EMAIL: 'from@x.com',
      BREVO_SENDER_NAME: 'App',
      NODE_ENV: 'production',
    });
    sendBrevoMock.mockResolvedValueOnce(undefined);
    await passwordResetService.sendResetEmail('user@example.com', 'https://app/reset?token=secret');
    expect(sendBrevoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'key',
        senderEmail: 'from@x.com',
        senderName: 'App',
        toEmail: 'user@example.com',
        subject: expect.stringContaining('Reset'),
      })
    );
    const html = (sendBrevoMock.mock.calls[0][0] as { htmlContent: string }).htmlContent;
    expect(html).toContain('https://app/reset?token=secret');
    expect(html).toContain('Requested at (UTC):');
    expect(html).not.toContain('<script');
    expect(loggerInfo).toHaveBeenCalledWith('Password reset email sent via Brevo', expect.any(Object));
  });

  it('sendResetEmail uses default sender name when BREVO_SENDER_NAME is empty', async () => {
    const { passwordResetService } = await loadPasswordResetModule({
      BREVO_API_KEY: 'key',
      BREVO_SENDER_EMAIL: 'from@x.com',
      NODE_ENV: 'production',
    });
    sendBrevoMock.mockResolvedValueOnce(undefined);
    await passwordResetService.sendResetEmail('a@b.com', 'http://x?t=1');
    expect(sendBrevoMock).toHaveBeenCalledWith(
      expect.objectContaining({ senderName: 'MemoOn Card' })
    );
  });

  it('sendResetEmail escapes href when link contains quotes', async () => {
    const { passwordResetService } = await loadPasswordResetModule({
      BREVO_API_KEY: 'k',
      BREVO_SENDER_EMAIL: 'f@x.com',
      NODE_ENV: 'production',
    });
    sendBrevoMock.mockResolvedValueOnce(undefined);
    const nasty = `https://x/?token=1&x=%22%20onclick=`;
    await passwordResetService.sendResetEmail('u@e.com', nasty);
    const html = (sendBrevoMock.mock.calls[0][0] as { htmlContent: string }).htmlContent;
    // `&` in URL must become `&amp;` inside HTML attribute; quotes escaped.
    expect(html).toContain('href="https://x/?token=1&amp;x=%22%20onclick="');
    expect(html).not.toContain('href="https://x/?token=1&x=" onclick=');
  });

  it('sendResetEmail logs error when Brevo throws', async () => {
    const { passwordResetService } = await loadPasswordResetModule({
      BREVO_API_KEY: 'key',
      BREVO_SENDER_EMAIL: 'from@x.com',
      NODE_ENV: 'production',
    });
    sendBrevoMock.mockRejectedValueOnce(new Error('api down'));
    await passwordResetService.sendResetEmail('a@b.com', 'http://x?t=1');
    expect(loggerError).toHaveBeenCalledWith('Brevo password reset send failed', expect.any(Object));
  });

  it('sendResetEmail without Brevo in development logs redacted link', async () => {
    const { passwordResetService } = await loadPasswordResetModule({ NODE_ENV: 'development' });
    await passwordResetService.sendResetEmail('user@example.com', 'http://localhost/r?token=abc');
    expect(sendBrevoMock).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      'Password reset link (dev only; set BREVO_API_KEY and BREVO_SENDER_EMAIL to send email)',
      expect.objectContaining({ resetLink: expect.stringContaining('[REDACTED]') })
    );
  });

  it('sendResetEmail with Brevo in development logs dev reference after send', async () => {
    const { passwordResetService } = await loadPasswordResetModule({
      BREVO_API_KEY: 'k',
      BREVO_SENDER_EMAIL: 'f@x.com',
      NODE_ENV: 'development',
    });
    sendBrevoMock.mockResolvedValueOnce(undefined);
    await passwordResetService.sendResetEmail('u@e.com', 'http://x?token=sec&other=1');
    expect(sendBrevoMock).toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      'Password reset link (dev reference, token redacted)',
      expect.any(Object)
    );
  });

  it('sendResetEmail in production without Brevo warns', async () => {
    const { passwordResetService } = await loadPasswordResetModule({ NODE_ENV: 'production' });
    await passwordResetService.sendResetEmail('u@e.com', 'http://x');
    expect(loggerWarn).toHaveBeenCalledWith(
      'Password reset email not sent: set BREVO_API_KEY and BREVO_SENDER_EMAIL',
      expect.any(Object)
    );
  });
});
