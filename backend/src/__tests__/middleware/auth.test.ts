/**
 * Tests for authentication middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, generateAccessToken, generateRefreshToken, getUserId } from '../../middleware/auth';
import { AuthenticationError } from '../../utils/errors';
import { HTTP_HEADERS } from '../../constants/http.constants';

// Mock JWT_SECRET
vi.mock('../../config/env', () => ({
  JWT_SECRET: 'test-secret-key-minimum-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
}));

describe('authMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should reject request without Authorization header', () => {
    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'No token provided',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request with invalid Authorization format', () => {
    mockRequest.headers = {
      authorization: 'InvalidFormat token123',
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'No token provided',
    });
  });

  it('should reject request with empty token', () => {
    mockRequest.headers = {
      authorization: 'Bearer ',
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token is required',
    });
  });

  it('should reject request with invalid token', () => {
    mockRequest.headers = {
      authorization: 'Bearer invalid-token',
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token',
    });
  });

  it('should accept valid token and attach userId', () => {
    const userId = 'user-123';
    const token = generateAccessToken(userId);

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockRequest.userId).toBe(userId);
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject expired token', () => {
    const userId = 'user-123';
    // Create an expired token
    const token = jwt.sign(
      { userId },
      'test-secret-key-minimum-32-characters-long',
      { expiresIn: '-1h' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token has expired',
    });
  });

  it('should reject token without userId', () => {
    const token = jwt.sign(
      {},
      'test-secret-key-minimum-32-characters-long',
      { expiresIn: '15m' }
    );

    mockRequest.headers = {
      authorization: `Bearer ${token}`,
    };

    authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token payload',
    });
  });
});

describe('generateAccessToken', () => {
  it('should generate valid JWT token', () => {
    const userId = 'user-123';
    const token = generateAccessToken(userId);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, 'test-secret-key-minimum-32-characters-long') as any;
    expect(decoded.userId).toBe(userId);
  });

  it('should include email if provided', () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const token = generateAccessToken(userId, email);

    const decoded = jwt.verify(token, 'test-secret-key-minimum-32-characters-long') as any;
    expect(decoded.email).toBe(email);
  });
});

describe('generateRefreshToken', () => {
  it('should generate valid refresh token', () => {
    const userId = 'user-123';
    const token = generateRefreshToken(userId);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, 'test-secret-key-minimum-32-characters-long') as any;
    expect(decoded.userId).toBe(userId);
  });
});

describe('getUserId', () => {
  it('should return userId from request', () => {
    const mockRequest = {
      userId: 'user-123',
    } as Request;

    expect(getUserId(mockRequest)).toBe('user-123');
  });

  it('should throw AuthenticationError if userId not present', () => {
    const mockRequest = {} as Request;

    expect(() => getUserId(mockRequest)).toThrow(AuthenticationError);
    expect(() => getUserId(mockRequest)).toThrow('User not authenticated');
  });
});
