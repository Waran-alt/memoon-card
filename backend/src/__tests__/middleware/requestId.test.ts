import { describe, expect, it, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '@/middleware/requestId';

describe('requestIdMiddleware', () => {
  it('generates request id when header is missing', () => {
    const req = { headers: {} } as Request;
    const res = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeTypeOf('string');
    expect(req.requestId?.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('reuses incoming x-request-id when present', () => {
    const req = { headers: { 'x-request-id': 'incoming-request-id' } } as unknown as Request;
    const res = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('incoming-request-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'incoming-request-id');
    expect(next).toHaveBeenCalledOnce();
  });
});

