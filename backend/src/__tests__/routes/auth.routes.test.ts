/**
 * Tests for auth routes (register, login, refresh, session, logout)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '@/routes/auth.routes';
import { errorHandler } from '@/middleware/errorHandler';
import { userService } from '@/services/user.service';
import { refreshTokenService } from '@/services/refresh-token.service';
import { User } from '@/types/database';

const recordAuthRefreshMetricMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/config/env', () => ({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-minimum-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:3002',
  CORS_ORIGINS: 'http://localhost:3002,https://memoon-card.localhost',
  getAllowedOrigins: () => ['http://localhost:3002', 'https://memoon-card.localhost'],
}));

vi.mock('@/services/user.service', () => ({
  userService: {
    createUser: vi.fn(),
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    verifyPassword: vi.fn(),
  },
}));

vi.mock('@/services/refresh-token.service', () => ({
  refreshTokenService: {
    createSession: vi.fn(),
    validateActiveToken: vi.fn(),
    rotateSession: vi.fn(),
    revokeToken: vi.fn(),
  },
}));

vi.mock('@/services/study-health-dashboard.service', () => ({
  StudyHealthDashboardService: vi.fn().mockImplementation(() => ({
    recordAuthRefreshMetric: recordAuthRefreshMetricMock,
    recordStudyApiMetric: vi.fn().mockResolvedValue(undefined),
    getDashboard: vi.fn().mockResolvedValue(undefined),
  })),
}));

const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockUser: User = {
  id: mockUserId,
  email: 'user@example.com',
  name: 'Test User',
  created_at: new Date(),
  updated_at: new Date(),
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('Auth routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    recordAuthRefreshMetricMock.mockResolvedValue(undefined);
  });

  describe('POST /api/auth/register', () => {
    it('should return 201 with accessToken and user', async () => {
      vi.mocked(userService.createUser).mockResolvedValueOnce(mockUser);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        user: { id: mockUserId, email: 'user@example.com', name: 'Test User' },
      });
      expect(res.body.data.accessToken).toBeDefined();
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(userService.createUser).toHaveBeenCalledWith(
        'user@example.com',
        'password123',
        'Test User'
      );
      expect(refreshTokenService.createSession).toHaveBeenCalledTimes(1);
    });

    it('should return error when email already exists', async () => {
      const { ConflictError: CE } = await import('@/utils/errors');
      vi.mocked(userService.createUser).mockRejectedValueOnce(
        new CE('An account with this email already exists')
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          name: 'User',
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(userService.createUser).toHaveBeenCalledWith(
        'existing@example.com',
        'password123',
        'User'
      );
      if (res.body?.error || res.body?.message) {
        const errorMsg = (res.body.error ?? res.body.message) as string;
        expect(errorMsg).toMatch(/already exists|conflict|error/i);
      }
    });

    it('should return 400 when validation fails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'short',
          name: 'User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 201 when name (username) is omitted', async () => {
      const userNoName = { ...mockUser, email: 'noname@example.com', name: null };
      vi.mocked(userService.createUser).mockResolvedValueOnce(userNoName);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'noname@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        id: mockUserId,
        email: 'noname@example.com',
        name: null,
      });
      expect(userService.createUser).toHaveBeenCalledWith(
        'noname@example.com',
        'password123',
        undefined
      );
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 with access token and user when credentials valid', async () => {
      const userWithHash = { ...mockUser, password_hash: 'hashed' };
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce(userWithHash);
      vi.mocked(userService.verifyPassword).mockResolvedValueOnce(true);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: mockUserId,
        email: 'user@example.com',
        name: 'Test User',
      });
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(userService.getUserByEmail).toHaveBeenCalledWith('user@example.com');
      expect(userService.verifyPassword).toHaveBeenCalledWith('password123', 'hashed');
      expect(refreshTokenService.createSession).toHaveBeenCalledTimes(1);
    });

    it('should set refresh cookie with httpOnly in response', async () => {
      const userWithHash = { ...mockUser, password_hash: 'hashed' };
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce(userWithHash);
      vi.mocked(userService.verifyPassword).mockResolvedValueOnce(true);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(' ') : String(setCookie);
      expect(cookieStr).toMatch(/refresh_token=/);
      expect(cookieStr).toMatch(/HttpOnly/i);
    });

    it('should return error when user not found', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@example.com',
          password: 'password123',
        });

      expect(userService.getUserByEmail).toHaveBeenCalledWith('unknown@example.com');
      expect(res.status).toBeGreaterThanOrEqual(400);
      if (res.body?.error || res.body?.message) {
        const errorMsg = (res.body.error ?? res.body.message) as string;
        expect(errorMsg).toMatch(/invalid|email|password|unauthorized/i);
      }
    });

    it('should return error when password wrong', async () => {
      const userWithHash = { ...mockUser, password_hash: 'hashed' };
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce(userWithHash);
      vi.mocked(userService.verifyPassword).mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'wrongpassword',
        });

      expect(userService.verifyPassword).toHaveBeenCalledWith('wrongpassword', 'hashed');
      expect(res.status).toBeGreaterThanOrEqual(400);
      if (res.body?.error || res.body?.message) {
        const errorMsg = (res.body.error ?? res.body.message) as string;
        expect(errorMsg).toMatch(/invalid|email|password|unauthorized/i);
      }
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 200 for valid refresh token in cookie', async () => {
      vi.mocked(userService.getUserById).mockResolvedValueOnce(mockUser);
      vi.mocked(refreshTokenService.rotateSession).mockResolvedValueOnce();

      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${validRefreshToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body).toMatchInlineSnapshot(
        {
          data: {
            accessToken: expect.any(String),
          },
        },
        `
        {
          "data": {
            "accessToken": Any<String>,
            "user": {
              "email": "user@example.com",
              "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
              "name": "Test User",
            },
          },
          "success": true,
        }
        `
      );
      expect(refreshTokenService.rotateSession).toHaveBeenCalledTimes(1);
      expect(recordAuthRefreshMetricMock).toHaveBeenCalledTimes(1);
    });

    it('should return error for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=invalid-token')
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(400);
      if (res.body?.error || res.body?.message) {
        const errorMsg = (res.body.error ?? res.body.message) as string;
        expect(errorMsg).toMatch(/invalid|expired|token|unauthorized/i);
      }
    });

    it('should return 401 when refreshToken missing', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});

      expect(res.status).toBe(401);
    });

    it('should return 401 when refresh token is only in body', async () => {
      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: validRefreshToken });

      expect(res.status).toBe(401);
    });

    it('should return 200 when valid refresh token is in cookie', async () => {
      vi.mocked(userService.getUserById).mockResolvedValueOnce(mockUser);
      vi.mocked(refreshTokenService.rotateSession).mockResolvedValueOnce();

      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${validRefreshToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(userService.getUserById).toHaveBeenCalledWith(mockUserId);
      expect(refreshTokenService.rotateSession).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when refresh token reuse is detected', async () => {
      vi.mocked(userService.getUserById).mockResolvedValueOnce(mockUser);
      const { AuthenticationError: AE } = await import('@/utils/errors');
      vi.mocked(refreshTokenService.rotateSession).mockRejectedValueOnce(
        new AE('Refresh token reuse detected')
      );

      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${validRefreshToken}`)
        .send({});

      expect(res.status).toBe(401);
      expect(refreshTokenService.rotateSession).toHaveBeenCalledTimes(1);
      expect(recordAuthRefreshMetricMock).toHaveBeenCalledTimes(1);
      if (res.body?.error || res.body?.message) {
        const errorMsg = (res.body.error ?? res.body.message) as string;
        expect(errorMsg).toMatch(/reuse|revoked|unauthorized/i);
      }
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return 200 with user when valid refresh cookie present', async () => {
      vi.mocked(userService.getUserById).mockResolvedValueOnce(mockUser);
      vi.mocked(refreshTokenService.validateActiveToken).mockResolvedValueOnce();

      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/auth/session')
        .set('Cookie', `refresh_token=${validRefreshToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: mockUserId,
        email: 'user@example.com',
        name: 'Test User',
      });
      expect(userService.getUserById).toHaveBeenCalledWith(mockUserId);
      expect(refreshTokenService.validateActiveToken).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when no cookie present', async () => {
      const res = await request(app).get('/api/auth/session');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 when cookie is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .set('Cookie', 'refresh_token=invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 204 and clear refresh cookie', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      const setCookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(' ') : String(setCookie ?? '');
      expect(cookieStr).toMatch(/refresh_token=;/);
    });

    it('should revoke refresh session when valid token cookie is present', async () => {
      const jwt = await import('jsonwebtoken');
      const validRefreshToken = jwt.default.sign(
        { userId: mockUserId },
        'test-secret-minimum-32-characters-long',
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${validRefreshToken}`);

      expect(res.status).toBe(204);
      expect(refreshTokenService.revokeToken).toHaveBeenCalledWith(mockUserId, validRefreshToken);
    });
  });

  describe('Cookie domain (security)', () => {
    it('should set Domain in Set-Cookie when Host matches allowed origin', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce({
        ...mockUser,
        password_hash: 'hashed',
      });
      vi.mocked(userService.verifyPassword).mockResolvedValueOnce(true);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/login')
        .set('Host', 'memoon-card.localhost')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(' ') : String(setCookie ?? '');
      expect(cookieStr).toMatch(/domain=memoon-card\.localhost/i);
    });

    it('should not set Domain when Host does not match allowed origin', async () => {
      vi.mocked(userService.getUserByEmail).mockResolvedValueOnce({
        ...mockUser,
        password_hash: 'hashed',
      });
      vi.mocked(userService.verifyPassword).mockResolvedValueOnce(true);
      vi.mocked(refreshTokenService.createSession).mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/auth/login')
        .set('Host', 'evil.example.com')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(' ') : String(setCookie ?? '');
      expect(cookieStr).not.toMatch(/domain=evil\.example\.com/i);
    });
  });
});
