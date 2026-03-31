import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getMetricsContentType, getMetricsText, httpMetricsMiddleware } from '@/metrics/prometheus';

function buildApp() {
  const app = express();
  app.use(httpMetricsMiddleware);
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', getMetricsContentType());
    res.send(await getMetricsText());
  });
  app.get('/ok', (_req, res) => {
    res.status(200).end();
  });
  return app;
}

describe('Prometheus metrics', () => {
  it('GET /metrics returns text exposition with memoon_ prefix', async () => {
    const res = await request(buildApp()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text/);
    expect(res.text).toMatch(/memoon_/);
  });

  it('increments http counter after a request', async () => {
    const app = buildApp();
    const before = await request(app).get('/metrics');
    await request(app).get('/ok');
    const after = await request(app).get('/metrics');
    expect(after.text.length).toBeGreaterThanOrEqual(before.text.length);
    expect(after.text).toMatch(/memoon_http_requests_total/);
  });
});
