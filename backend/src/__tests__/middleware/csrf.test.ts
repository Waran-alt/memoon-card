/**
 * Tests for CSRF protection middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { csrfProtection } from '../../middleware/csrf';
import { HTTP_STATUS } from '../../constants/http.constants';

// Mock env config
vi.mock('../../config/env', () => ({
  CORS_ORIGIN: 'http://localhost:3002',
  CORS_ORIGINS: undefined,
}));

describe('csrfProtection', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should allow safe methods (GET)', () => {
    mockRequest.method = 'GET';
    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should allow safe methods (HEAD)', () => {
    mockRequest.method = 'HEAD';
    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should allow safe methods (OPTIONS)', () => {
    mockRequest.method = 'OPTIONS';
    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject POST without Origin or Referer or custom header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {};

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'CSRF validation failed: Missing required header',
      hint: 'Include X-Requested-With header in requests',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should accept POST with valid Origin header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      origin: 'http://localhost:3002',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject POST with invalid Origin header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      origin: 'http://evil.com',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'CSRF validation failed: Invalid origin',
    });
  });

  it('should accept POST with valid Referer header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      referer: 'http://localhost:3002/some-page',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject POST with invalid Referer header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      referer: 'http://evil.com/page',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'CSRF validation failed: Invalid referer',
    });
  });

  it('should accept POST with X-Requested-With header', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      'x-requested-with': 'XMLHttpRequest',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject POST with malformed Referer URL', () => {
    mockRequest.method = 'POST';
    mockRequest.headers = {
      referer: 'not-a-valid-url',
    };

    csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'CSRF validation failed: Malformed referer URL',
    });
  });
});
