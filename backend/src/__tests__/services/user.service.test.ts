/**
 * Tests for UserService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '@/services/user.service';
import { User } from '@/types/database';
import { pool } from '@/config/database';
import { ConflictError } from '@/utils/errors';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';

describe('UserService', () => {
  let userService: UserService;
  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockUser: User = {
    id: mockUserId,
    email: 'test@example.com',
    name: 'Test User',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
  });

  describe('createUser', () => {
    it('should create a user and default user_settings', async () => {
      const clientQuery = vi.fn();
      clientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT users
        .mockResolvedValueOnce({}) // INSERT user_settings
        .mockResolvedValueOnce({}); // COMMIT

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        query: clientQuery,
        release: vi.fn(),
      });

      const result = await userService.createUser('test@example.com', 'password123', 'Test User');

      expect(result).toEqual(mockUser);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(clientQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO users'),
        ['test@example.com', 'Test User', 'hashed-password']
      );
      expect(clientQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO user_settings'),
        expect.any(Array)
      );
      expect(clientQuery).toHaveBeenNthCalledWith(4, 'COMMIT');
    });

    it('should trim and lowercase email', async () => {
      const clientQuery = vi.fn();
      clientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ ...mockUser, email: 'user@test.com' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        query: clientQuery,
        release: vi.fn(),
      });

      await userService.createUser('  User@Test.COM  ', 'pass', 'Name');

      expect(clientQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO users'),
        ['user@test.com', 'Name', 'hashed-password']
      );
    });

    it('should throw ConflictError on duplicate email', async () => {
      const clientQuery = vi.fn();
      clientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce({ code: '23505' }) // INSERT users - unique violation
        .mockResolvedValueOnce({}); // ROLLBACK (in catch)

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        query: clientQuery,
        release: vi.fn(),
      });

      await expect(
        userService.createUser('existing@example.com', 'password', 'Name')
      ).rejects.toThrow(ConflictError);
    });

    it('should handle null name', async () => {
      const clientQuery = vi.fn();
      const userNoName = { ...mockUser, name: null };
      clientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [userNoName] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        query: clientQuery,
        release: vi.fn(),
      });

      const result = await userService.createUser('a@b.com', 'pass');

      expect(result.name).toBeNull();
      expect(clientQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO users'),
        ['a@b.com', null, 'hashed-password']
      );
    });
  });

  describe('getUserByEmail', () => {
    it('should return user with password_hash when found', async () => {
      const userWithHash = { ...mockUser, password_hash: 'hashed' };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [userWithHash],
        rowCount: 1,
      });

      const result = await userService.getUserByEmail('test@example.com');

      expect(result).toEqual(userWithHash);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['test@example.com']
      );
    });

    it('should return null when user not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await userService.getUserByEmail('unknown@example.com');

      expect(result).toBeNull();
    });

    it('should trim and lowercase email in query', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await userService.getUserByEmail('  User@TEST.com  ');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email'),
        ['user@test.com']
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return true when password matches hash', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

      const result = await userService.verifyPassword('password', 'hash');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hash');
    });

    it('should return false when password does not match', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      const result = await userService.verifyPassword('wrong', 'hash');

      expect(result).toBe(false);
    });

    it('should return false when hash is null', async () => {
      const result = await userService.verifyPassword('password', null);

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });
});
