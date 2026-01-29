/**
 * Test Utilities and Helpers
 * 
 * Common utilities for testing
 */

import { vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

/**
 * Create a mock Express Request
 */
export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    query: {},
    params: {},
    userId: undefined,
    requestId: undefined,
    method: 'GET',
    path: '/',
    ...overrides,
  } as Partial<Request>;
}

/**
 * Create a mock Express Response
 */
export function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock NextFunction
 */
export function createMockNext(): NextFunction {
  return vi.fn();
}

/**
 * Create a mock database pool
 */
export function createMockPool(): Partial<Pool> {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  } as Partial<Pool>;
}

/**
 * Create a mock database query result
 */
export function createMockQueryResult<T>(rows: T[] = []): { rows: T[]; rowCount: number } {
  return {
    rows,
    rowCount: rows.length,
  };
}

/**
 * Wait for a specified time (useful for async tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
