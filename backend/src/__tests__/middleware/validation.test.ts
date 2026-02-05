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

  it('should reject when required body field is missing', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    mockRequest.body = { name: 'John' };

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

  it('should set validatedQuery on req with parsed and transformed values', () => {
    const schema = z.object({
      page: z.string().transform((val) => parseInt(val, 10)),
      limit: z.string().transform((val) => parseInt(val, 10)),
    });

    mockRequest.query = { page: '2', limit: '20' };

    const middleware = validateQuery(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    const reqWithQuery = mockRequest as Request & { validatedQuery?: { page: number; limit: number } };
    expect(reqWithQuery.validatedQuery).toEqual({ page: 2, limit: 20 });
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

  it('should include validation details with path and message on reject', () => {
    const schema = z.object({
      limit: z.string().regex(/^\d+$/),
    });

    mockRequest.query = { limit: 'abc' };

    const middleware = validateQuery(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid query parameters',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(String),
            message: expect.any(String),
          }),
        ]),
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

  it('should validate multiple route parameters', () => {
    const schema = z.object({
      deckId: z.string().uuid(),
      cardId: z.string().uuid(),
    });

    mockRequest.params = {
      deckId: '123e4567-e89b-12d3-a456-426614174000',
      cardId: '223e4567-e89b-12d3-a456-426614174001',
    };

    const middleware = validateParams(schema);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
