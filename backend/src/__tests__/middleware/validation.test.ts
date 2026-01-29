/**
 * Tests for validation middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, validateQuery, validateParams } from '../../middleware/validation';
import { ValidationError } from '../../utils/errors';

describe('validateRequest', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should validate and pass valid request body', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    mockRequest.body = { name: 'John', age: 30 };

    const middleware = validateRequest(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject invalid request body', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    mockRequest.body = { name: 'John', age: 'not-a-number' };

    const middleware = validateRequest(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Validation failed',
        details: expect.any(Array),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should transform validated data', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.string().transform((val) => parseInt(val, 10)),
    });

    mockRequest.body = { email: 'test@example.com', age: '25' };

    const middleware = validateRequest(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockRequest.body).toEqual({ email: 'test@example.com', age: 25 });
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('validateQuery', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      query: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should validate and pass valid query parameters', () => {
    const schema = z.object({
      page: z.string().transform((val) => parseInt(val, 10)),
      limit: z.string().transform((val) => parseInt(val, 10)),
    });

    mockRequest.query = { page: '1', limit: '10' };

    const middleware = validateQuery(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject invalid query parameters', () => {
    const schema = z.object({
      page: z.string().regex(/^\d+$/),
    });

    mockRequest.query = { page: 'invalid' };

    const middleware = validateQuery(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid query parameters',
      })
    );
  });
});

describe('validateParams', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      params: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should validate and pass valid route parameters', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

    const middleware = validateParams(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject invalid route parameters', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    mockRequest.params = { id: 'not-a-uuid' };

    const middleware = validateParams(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid route parameters',
      })
    );
  });
});
