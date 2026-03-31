/**
 * Refresh sessions: SHA-256 of raw JWT in DB, rotation with row lock; reuse of a revoked token revokes all sessions (replay/theft).
 * Never log raw refresh tokens or hashes in debug output (grid 1.3 / 8.1).
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pool } from '@/config/database';
import { AuthenticationError } from '@/utils/errors';

interface RefreshTokenMetadata {
  userAgent?: string;
  ipAddress?: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
}

function extractTokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  if (!decoded?.exp || typeof decoded.exp !== 'number') {
    throw new AuthenticationError('Invalid refresh token');
  }
  return new Date(decoded.exp * 1000);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class RefreshTokenService {
  async createSession(userId: string, refreshToken: string, meta?: RefreshTokenMetadata): Promise<void> {
    const expiresAt = extractTokenExpiry(refreshToken);
    const tokenHash = hashToken(refreshToken);
    await pool.query(
      `
      INSERT INTO refresh_token_sessions (
        user_id, token_hash, expires_at, user_agent, ip_address
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (token_hash) DO NOTHING
      `,
      [userId, tokenHash, expiresAt, meta?.userAgent ?? null, meta?.ipAddress ?? null]
    );
  }

  async validateActiveToken(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const result = await pool.query<RefreshTokenRow>(
      `
      SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_id
      FROM refresh_token_sessions
      WHERE user_id = $1 AND token_hash = $2
      LIMIT 1
      `,
      [userId, tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      throw new AuthenticationError('Refresh session not found');
    }
    if (row.revoked_at) {
      if (row.replaced_by_id) {
        await this.revokeAllActiveSessions(userId);
      }
      throw new AuthenticationError('Refresh token revoked');
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new AuthenticationError('Refresh token expired');
    }

    await pool.query(
      `UPDATE refresh_token_sessions SET last_used_at = NOW() WHERE id = $1`,
      [row.id]
    );
  }

  async rotateSession(
    userId: string,
    oldRefreshToken: string,
    newRefreshToken: string,
    meta?: RefreshTokenMetadata
  ): Promise<void> {
    const oldHash = hashToken(oldRefreshToken);
    const newHash = hashToken(newRefreshToken);
    const newExpiresAt = extractTokenExpiry(newRefreshToken);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const currentResult = await client.query<RefreshTokenRow>(
        `
        SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_id
        FROM refresh_token_sessions
        WHERE user_id = $1 AND token_hash = $2
        FOR UPDATE
        `,
        [userId, oldHash]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new AuthenticationError('Refresh session not found');
      }
      if (current.revoked_at) {
        // Old token presented again after rotation: treat as compromise, kill all refresh sessions.
        await this.revokeAllActiveSessions(userId, client);
        throw new AuthenticationError('Refresh token reuse detected');
      }
      if (current.expires_at.getTime() <= Date.now()) {
        throw new AuthenticationError('Refresh token expired');
      }

      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO refresh_token_sessions (
          user_id, token_hash, expires_at, user_agent, ip_address
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [userId, newHash, newExpiresAt, meta?.userAgent ?? null, meta?.ipAddress ?? null]
      );
      const nextSessionId = inserted.rows[0]?.id;
      if (!nextSessionId) {
        throw new AuthenticationError('Failed to rotate refresh token');
      }

      await client.query(
        `
        UPDATE refresh_token_sessions
        SET revoked_at = NOW(), replaced_by_id = $2, last_used_at = NOW()
        WHERE id = $1
        `,
        [current.id, nextSessionId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeToken(userId: string, refreshToken: string): Promise<void> {
    await pool.query(
      `
      UPDATE refresh_token_sessions
      SET revoked_at = NOW(), last_used_at = NOW()
      WHERE user_id = $1
        AND token_hash = $2
        AND revoked_at IS NULL
      `,
      [userId, hashToken(refreshToken)]
    );
  }

  async revokeAllActiveSessions(
    userId: string,
    dbClient: { query: typeof pool.query } = pool
  ): Promise<void> {
    await dbClient.query(
      `
      UPDATE refresh_token_sessions
      SET revoked_at = NOW(), last_used_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
      `,
      [userId]
    );
  }
}

export const refreshTokenService = new RefreshTokenService();
