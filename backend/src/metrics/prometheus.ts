/**
 * Prometheus exposition (`GET /metrics`). Process + HTTP counters for Grafana/Prometheus scrape.
 * Disable with METRICS_ENABLED=false (e.g. tests). Do not expose /metrics on the public internet without restriction (nginx).
 */
import type { NextFunction, Request, Response } from 'express';
import * as client from 'prom-client';

export const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: 'memoon_node_',
});

const httpRequestsTotal = new client.Counter({
  name: 'memoon_http_requests_total',
  help: 'Total HTTP responses (excludes /metrics scrape path on counter increment)',
  labelNames: ['method', 'status_code'],
  registers: [register],
});

/** Count responses; skip /metrics to avoid scrape noise. */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') {
    next();
    return;
  }
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      status_code: String(res.statusCode),
    });
  });
  next();
}

export function getMetricsContentType(): string {
  return register.contentType;
}

export async function getMetricsText(): Promise<string> {
  return register.metrics();
}
