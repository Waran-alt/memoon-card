/**
 * Grid 9.2: mutating and sensitive read routes return 401 without Bearer token.
 * Stack matches index.ts order: CSRF on /api (bypass for tests via X-Requested-With) → auth → routes.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from '@/middleware/auth';
import { csrfProtection } from '@/middleware/csrf';
import { errorHandler } from '@/middleware/errorHandler';
import cardsRoutes from '@/routes/cards.routes';
import reviewsRoutes from '@/routes/reviews.routes';
import studyRoutes from '@/routes/study.routes';

/** Non-browser clients (e.g. supertest) must pass CSRF policy before auth is reached (see middleware/csrf.ts). */
const CSRF_OK = { 'X-Requested-With': 'XMLHttpRequest' } as const;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', csrfProtection);
  app.use('/api/cards', authMiddleware, cardsRoutes);
  app.use('/api/reviews', authMiddleware, reviewsRoutes);
  app.use('/api/study', authMiddleware, studyRoutes);
  app.use(errorHandler);
  return app;
}

describe('Protected API routes without authentication', () => {
  const app = createApp();
  const cardId = '22222222-2222-4222-8222-222222222222';

  it('GET /api/study/stats returns 401 without Authorization', async () => {
    const res = await request(app).get('/api/study/stats');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No token provided');
  });

  it('POST /api/reviews/batch returns 401 without Authorization (after CSRF)', async () => {
    const res = await request(app)
      .post('/api/reviews/batch')
      .set(CSRF_OK)
      .send({ reviews: [{ cardId, rating: 3 }] });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/cards/:id/review returns 401 without Authorization (after CSRF)', async () => {
    const res = await request(app)
      .post(`/api/cards/${cardId}/review`)
      .set(CSRF_OK)
      .send({ rating: 3 });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/cards/:id returns 401 without Authorization (after CSRF)', async () => {
    const res = await request(app)
      .put(`/api/cards/${cardId}`)
      .set(CSRF_OK)
      .send({ recto: 'a', verso: 'b' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/reviews/batch returns 403 CSRF when mutating without Origin/Referer/X-Requested-With', async () => {
    const res = await request(app).post('/api/reviews/batch').send({ reviews: [{ cardId, rating: 3 }] });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toContain('CSRF');
  });
});
