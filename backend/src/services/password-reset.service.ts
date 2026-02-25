/**
 * Password reset (forgot-password) flow.
 * Creates time-limited, single-use tokens. Does not send email by default;
 * in development the reset link is logged. For production, wire an email sender
 * in sendResetEmail or set up a transactional email provider.
 */

import crypto from 'crypto';
import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_MINUTES = 60;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export class PasswordResetService {
  /**
   * Create a reset token for the user. Returns the plain token (to send in link)
   * and expiresAt. Caller should send the link to the user (email or dev log).
   */
  async createToken(userId: string, expiryMinutes: number = DEFAULT_EXPIRY_MINUTES): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const tokenHash = hashToken(token);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
    return { token, expiresAt };
  }

  /**
   * Find user_id for a valid, unused, non-expired token. Returns null if invalid.
   */
  async getUserIdForToken(token: string): Promise<string | null> {
    const tokenHash = hashToken(token);
    const result = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash]
    );
    return result.rows[0]?.user_id ?? null;
  }

  /**
   * Mark token as used so it cannot be reused.
   */
  async consumeToken(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
      [tokenHash]
    );
  }

  /**
   * Build reset URL and "send" to user. In development logs the link to console.
   * For production, integrate an email sender (nodemailer, SendGrid, etc.) here.
   */
  sendResetEmail(email: string, resetLink: string): void {
    if (process.env.NODE_ENV === 'development') {
      logger.info('Password reset link (dev only)', { email: email.replace(/(?<=.{2}).(?=@)/g, '*'), resetLink });
    }
    // TODO production: send email via your provider, e.g.:
    // await emailTransport.sendMail({ to: email, subject: 'Reset your password', html: `...${resetLink}...` });
  }
}

export const passwordResetService = new PasswordResetService();
