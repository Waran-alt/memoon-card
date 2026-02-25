/**
 * User Service
 *
 * User creation, lookup by email, and password verification for authentication.
 */

import bcrypt from 'bcryptjs';
import { pool } from '@/config/database';
import { User } from '@/types/database';
import { ConflictError } from '@/utils/errors';
import { FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';

const SALT_ROUNDS = 10;

export class UserService {
  /**
   * Create a new user and default user_settings row.
   * @throws ConflictError if email already exists
   */
  async createUser(
    email: string,
    password: string,
    name?: string | null
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<User>(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, 'user')
         RETURNING id, email, name, role, created_at, updated_at`,
        [email.trim().toLowerCase(), name?.trim() || null, passwordHash]
      );
      const user = userResult.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        throw new Error('User insert returned no row');
      }

      await client.query(
        `INSERT INTO user_settings (user_id, fsrs_weights)
         VALUES ($1, $2::jsonb)`,
        [user.id, JSON.stringify([...FSRS_V6_DEFAULT_WEIGHTS])]
      );

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ConflictError('An account with this email already exists');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by ID (for session; no password_hash).
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await pool.query<User>(
      'SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email (includes password_hash for verification).
   */
  async getUserByEmail(email: string): Promise<(User & { password_hash: string | null }) | null> {
    const result = await pool.query<User & { password_hash: string | null }>(
      'SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    return result.rows[0] || null;
  }

  /**
   * Verify plain password against stored hash.
   */
  async verifyPassword(plainPassword: string, hash: string | null): Promise<boolean> {
    if (!hash) {
      return false;
    }
    return bcrypt.compare(plainPassword, hash);
  }

  /** Update user password (e.g. after reset). */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      passwordHash,
      userId,
    ]);
  }
}

export const userService = new UserService();
