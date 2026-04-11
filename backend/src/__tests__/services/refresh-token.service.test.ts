import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { RefreshTokenService } from '@/services/refresh-token.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('RefreshTokenService', () => {
  const service = new RefreshTokenService();
  const userId = '11111111-1111-4111-8111-111111111111';
  const familyId = '22222222-2222-4222-8222-222222222222';
  const token = jwt.sign({ userId }, 'test-secret', { expiresIn: '7d' });

  beforeEach(() => {
    vi.clearAllMocks();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
  });

  it('creates a refresh session with metadata and family_id', async () => {
    await service.createSession(userId, token, {
      userAgent: 'vitest',
      ipAddress: '127.0.0.1',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO refresh_token_sessions'),
      expect.arrayContaining([
        userId,
        expect.any(String),
        expect.any(Date),
        'vitest',
        '127.0.0.1',
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ),
      ])
    );
  });

  it('validates active token and updates last_used_at', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: userId,
            family_id: familyId,
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            replaced_by_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await service.validateActiveToken(userId, token);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE refresh_token_sessions SET last_used_at = NOW()'),
      ['session-1']
    );
  });

  it('rejects when refresh session is missing', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

    await expect(service.validateActiveToken(userId, token)).rejects.toThrow(/session not found/i);
  });

  it('revokes family sessions on reuse detection in validate path', async () => {
    const revokeFamilySpy = vi.spyOn(service, 'revokeAllSessionsInFamily').mockResolvedValueOnce();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          user_id: userId,
          family_id: familyId,
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 60_000),
          revoked_at: new Date(),
          replaced_by_id: 'session-2',
        },
      ],
    });

    await expect(service.validateActiveToken(userId, token)).rejects.toThrow(/revoked/i);
    expect(revokeFamilySpy).toHaveBeenCalledWith(userId, familyId);
  });

  it('rotates session in a transaction', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'old-session',
              user_id: userId,
              family_id: familyId,
              token_hash: 'old-hash',
              expires_at: new Date(Date.now() + 60_000),
              revoked_at: null,
              replaced_by_id: null,
            },
          ],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id: 'new-session' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // UPDATE old
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };
    (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(client);

    const nextToken = jwt.sign({ userId }, 'test-secret', { expiresIn: '7d' });
    await service.rotateSession(userId, token, nextToken, { userAgent: 'ua' });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FOR UPDATE'),
      [userId, expect.any(String)]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO refresh_token_sessions'),
      [userId, expect.any(String), expect.any(Date), 'ua', null, familyId]
    );
    expect(client.query).toHaveBeenNthCalledWith(5, 'COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('revokes token by hash', async () => {
    await service.revokeToken(userId, token);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at = NOW(), last_used_at = NOW()'),
      [userId, expect.any(String)]
    );
  });
});
