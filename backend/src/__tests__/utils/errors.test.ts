/**
 * Tests for custom error classes
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
} from '../../utils/errors';

describe('AppError', () => {
  it('should create error with status code and message', () => {
    const error = new AppError(400, 'Test error');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Test error');
    expect(error.isOperational).toBe(true);
  });

  it('should allow custom isOperational flag', () => {
    const error = new AppError(500, 'Test error', false);
    expect(error.isOperational).toBe(false);
  });

  it('should be instance of Error', () => {
    const error = new AppError(400, 'Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('ValidationError', () => {
  it('should have status code 400', () => {
    const error = new ValidationError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid input');
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('AuthenticationError', () => {
  it('should have status code 401', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Authentication required');
  });

  it('should allow custom message', () => {
    const error = new AuthenticationError('Custom auth error');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Custom auth error');
  });
});

describe('AuthorizationError', () => {
  it('should have status code 403', () => {
    const error = new AuthorizationError();
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Insufficient permissions');
  });

  it('should allow custom message', () => {
    const error = new AuthorizationError('Custom authz error');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Custom authz error');
  });
});

describe('NotFoundError', () => {
  it('should have status code 404', () => {
    const error = new NotFoundError();
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
  });

  it('should allow custom resource name', () => {
    const error = new NotFoundError('Card');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Card not found');
  });
});

describe('ConflictError', () => {
  it('should have status code 409', () => {
    const error = new ConflictError('Resource already exists');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Resource already exists');
  });
});

describe('InternalServerError', () => {
  it('should have status code 500', () => {
    const error = new InternalServerError();
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('An internal error occurred');
  });

  it('should allow custom message', () => {
    const error = new InternalServerError('Custom error');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Custom error');
  });
});
