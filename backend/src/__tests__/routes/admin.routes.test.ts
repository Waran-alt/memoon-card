import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import adminRoutes from '@/routes/admin.routes';
import { errorHandler } from '@/middleware/errorHandler';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use(errorHandler);
  return app;
}

describe('Admin routes (user management)', () => {
  const app = createApp();

  it('lists users (stub)', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('users');
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users).toHaveLength(0);
  });
});
