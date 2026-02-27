/**
 * Tests for knowledge routes (CRUD, soft-delete only)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import knowledgeRoutes from '@/routes/knowledge.routes';
import { errorHandler } from '@/middleware/errorHandler';
import type { KnowledgeRow } from '@/services/knowledge.service';

const { mockUserId, mockKnowledgeId, knowledgeServiceMock } = vi.hoisted(() => ({
  mockUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  mockKnowledgeId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  knowledgeServiceMock: {
    create: vi.fn(),
    getById: vi.fn(),
    listByUserId: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/services/knowledge.service', () => ({
  KnowledgeService: vi.fn().mockImplementation(() => knowledgeServiceMock),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/knowledge', knowledgeRoutes);
  app.use(errorHandler);
  return app;
}

describe('Knowledge routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/knowledge', () => {
    it('creates knowledge with content', async () => {
      const content = 'Some context.';
      const created: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content,
        created_at: new Date(),
        updated_at: new Date(),
      };
      knowledgeServiceMock.create.mockResolvedValueOnce(created);

      const res = await request(app)
        .post('/api/knowledge')
        .send({ content });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ id: mockKnowledgeId, content });
      expect(knowledgeServiceMock.create).toHaveBeenCalledWith(mockUserId, content);
    });

    it('creates knowledge with empty body (null content)', async () => {
      const created: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      knowledgeServiceMock.create.mockResolvedValueOnce(created);

      const res = await request(app).post('/api/knowledge').send({});

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBeNull();
      expect(knowledgeServiceMock.create).toHaveBeenCalledWith(mockUserId, null);
    });
  });

  describe('GET /api/knowledge', () => {
    it('returns list of knowledge for user', async () => {
      const list: KnowledgeRow[] = [
        {
          id: mockKnowledgeId,
          user_id: mockUserId,
          content: 'First',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      knowledgeServiceMock.listByUserId.mockResolvedValueOnce(list);

      const res = await request(app).get('/api/knowledge');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('First');
      expect(knowledgeServiceMock.listByUserId).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('GET /api/knowledge/:id', () => {
    it('returns knowledge when found', async () => {
      const row: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Found',
        created_at: new Date(),
        updated_at: new Date(),
      };
      knowledgeServiceMock.getById.mockResolvedValueOnce(row);

      const res = await request(app).get(`/api/knowledge/${mockKnowledgeId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Found');
      expect(knowledgeServiceMock.getById).toHaveBeenCalledWith(mockKnowledgeId, mockUserId);
    });

    it('returns 404 when not found', async () => {
      knowledgeServiceMock.getById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/knowledge/${mockKnowledgeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/knowledge/:id', () => {
    it('updates content', async () => {
      const updated: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Updated',
        created_at: new Date(),
        updated_at: new Date(),
      };
      knowledgeServiceMock.update.mockResolvedValueOnce(updated);

      const res = await request(app)
        .patch(`/api/knowledge/${mockKnowledgeId}`)
        .send({ content: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Updated');
      expect(knowledgeServiceMock.update).toHaveBeenCalledWith(
        mockKnowledgeId,
        mockUserId,
        'Updated'
      );
    });
  });

  describe('DELETE /api/knowledge/:id', () => {
    it('soft-deletes and returns the row', async () => {
      const deleted: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Gone',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: new Date(),
      };
      knowledgeServiceMock.softDelete.mockResolvedValueOnce(deleted);

      const res = await request(app).delete(`/api/knowledge/${mockKnowledgeId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(knowledgeServiceMock.softDelete).toHaveBeenCalledWith(mockKnowledgeId, mockUserId);
    });

    it('returns 404 when not found', async () => {
      knowledgeServiceMock.softDelete.mockResolvedValueOnce(null);

      const res = await request(app).delete(`/api/knowledge/${mockKnowledgeId}`);

      expect(res.status).toBe(404);
    });
  });
});
