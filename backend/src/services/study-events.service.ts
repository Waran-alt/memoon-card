import { pool } from '@/config/database';
import { StudyEventType } from '@/types/database';
import { CardJourneyService, CardJourneyEventInput } from './card-journey.service';
import { createHash } from 'crypto';
import {
  getDefaultPolicyVersion,
  normalizePolicyVersion,
  withPolicyVersionPayload,
} from '@/services/policy-version.utils';

export interface StudyEventInput {
  eventType: StudyEventType;
  clientEventId?: string;
  policyVersion?: string;
  sessionId?: string;
  cardId?: string;
  deckId?: string;
  occurredAtClient?: number;
  sequenceInSession?: number;
  payload?: unknown;
}

export interface StudySessionHistoryRow {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  eventCount: number;
  distinctCardCount: number;
  reviewCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
}

export interface StudySessionDetail {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  events: Array<{
    id: string;
    eventType: string;
    cardId: string | null;
    deckId: string | null;
    eventTime: number;
    sequenceInSession: number | null;
    payload: Record<string, unknown>;
  }>;
  ratings: {
    reviewCount: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
  };
  /** Review logs for this session (order = review_time) for stability/difficulty before→after */
  sessionReviewLogs: Array<{
    cardId: string;
    rating: number;
    reviewTime: number;
    scheduledDays: number;
    elapsedDays: number;
    stabilityBefore: number | null;
    difficultyBefore: number | null;
    stabilityAfter: number | null;
    difficultyAfter: number | null;
  }>;
}

export class StudyEventsService {
  private journey = new CardJourneyService();
  private static readonly CARD_JOURNEY_EVENT_TYPES = new Set<StudyEventType>([
    'card_shown',
    'answer_revealed',
    'rating_submitted',
    'importance_toggled',
  ]);

  private deterministicUuid(input: string): string {
    const hex = createHash('md5').update(input).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  private isCardJourneyEventType(
    eventType: StudyEventType
  ): eventType is 'card_shown' | 'answer_revealed' | 'rating_submitted' | 'importance_toggled' {
    return StudyEventsService.CARD_JOURNEY_EVENT_TYPES.has(eventType);
  }

  private async validateOwnership(
    userId: string,
    events: StudyEventInput[],
    dbClient: { query: typeof pool.query }
  ): Promise<void> {
    const cardIds = Array.from(
      new Set(events.map((event) => event.cardId).filter((v): v is string => !!v))
    );
    const deckIds = Array.from(
      new Set(events.map((event) => event.deckId).filter((v): v is string => !!v))
    );

    if (cardIds.length > 0) {
      const cardResult = await dbClient.query<{ id: string }>(
        `SELECT id
         FROM cards
         WHERE user_id = $1
           AND id = ANY($2::uuid[])`,
        [userId, cardIds]
      );
      if (cardResult.rows.length !== cardIds.length) {
        throw new Error('Invalid card ownership in study events payload');
      }
    }

    if (deckIds.length > 0) {
      const deckResult = await dbClient.query<{ id: string }>(
        `SELECT id
         FROM decks
         WHERE user_id = $1
           AND id = ANY($2::uuid[])`,
        [userId, deckIds]
      );
      if (deckResult.rows.length !== deckIds.length) {
        throw new Error('Invalid deck ownership in study events payload');
      }
    }
  }
  async logEvent(
    userId: string,
    event: StudyEventInput,
    dbClient: { query: typeof pool.query } = pool
  ): Promise<void> {
    await this.logEvents(userId, [event], dbClient);
  }

  async logEvents(
    userId: string,
    events: StudyEventInput[],
    dbClient: { query: typeof pool.query } = pool
  ): Promise<void> {
    if (events.length === 0) return;
    await this.validateOwnership(userId, events, dbClient);

    const now = Date.now();
    const normalizedEvents = events.map((event) => {
      const occurredAtClient = event.occurredAtClient ?? now;
      const payloadRecord =
        event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : {};
      const policyVersion = normalizePolicyVersion(
        event.policyVersion ?? payloadRecord.policyVersion ?? getDefaultPolicyVersion()
      );
      const clientEventId =
        event.clientEventId ??
        this.deterministicUuid(
          [
            userId,
            event.eventType,
            event.sessionId ?? '',
            event.cardId ?? '',
            event.deckId ?? '',
            String(event.sequenceInSession ?? ''),
            String(occurredAtClient),
          ].join('|')
        );
      return {
        ...event,
        occurredAtClient,
        clientEventId,
        policyVersion,
        payload: withPolicyVersionPayload(event.payload, policyVersion),
      };
    });
    const valuesSql: string[] = [];
    const params: unknown[] = [];

    normalizedEvents.forEach((event, index) => {
      const base = index * 11;
      valuesSql.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb)`
      );

      params.push(
        userId,
        event.deckId ?? null,
        event.cardId ?? null,
        event.sessionId ?? null,
        event.clientEventId,
        event.eventType,
        event.occurredAtClient,
        now,
        event.sequenceInSession ?? null,
        event.policyVersion,
        JSON.stringify(event.payload ?? {})
      );
    });

    await dbClient.query(
      `
      INSERT INTO study_events (
        user_id,
        deck_id,
        card_id,
        session_id,
        client_event_id,
        event_type,
        occurred_at_client,
        received_at_server,
        sequence_in_session,
        policy_version,
        payload_json
      )
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT (user_id, client_event_id)
      DO NOTHING
      `,
      params
    );

    const journeyEvents: CardJourneyEventInput[] = [];
    for (const event of normalizedEvents) {
      if (!event.cardId) continue;
      if (!this.isCardJourneyEventType(event.eventType)) continue;
      const idempotencyKey = `study-events:${event.clientEventId}`;
      journeyEvents.push({
        cardId: String(event.cardId),
        deckId: event.deckId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        eventTime: event.occurredAtClient ?? now,
        actor: 'user',
        source: 'study_events',
        idempotencyKey,
        policyVersion: event.policyVersion,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });
    }

    await this.journey.appendEvents(userId, journeyEvents, dbClient);
  }

  async getSessionHistory(
    userId: string,
    options?: { days?: number; limit?: number; offset?: number }
  ): Promise<StudySessionHistoryRow[]> {
    const days = Math.max(1, Math.min(180, options?.days ?? 30));
    const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
    const offset = Math.max(0, options?.offset ?? 0);
    const result = await pool.query(
      `
      WITH session_events AS (
        SELECT
          session_id,
          MIN(COALESCE(occurred_at_client, received_at_server))::bigint AS started_at,
          MAX(COALESCE(occurred_at_client, received_at_server))::bigint AS ended_at,
          COUNT(*)::int AS event_count,
          COUNT(DISTINCT card_id)::int AS distinct_card_count
        FROM study_events
        WHERE user_id = $1
          AND session_id IS NOT NULL
          AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY session_id
      ),
      session_reviews AS (
        SELECT
          session_id,
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE rating = 1)::int AS again_count,
          COUNT(*) FILTER (WHERE rating = 2)::int AS hard_count,
          COUNT(*) FILTER (WHERE rating = 3)::int AS good_count,
          COUNT(*) FILTER (WHERE rating = 4)::int AS easy_count
        FROM review_logs
        WHERE user_id = $1
          AND session_id IS NOT NULL
          AND review_date >= NOW() - ($2::int * INTERVAL '1 day')
        GROUP BY session_id
      )
      SELECT
        se.session_id::text AS session_id,
        se.started_at,
        se.ended_at,
        se.event_count,
        se.distinct_card_count,
        COALESCE(sr.review_count, 0)::int AS review_count,
        COALESCE(sr.again_count, 0)::int AS again_count,
        COALESCE(sr.hard_count, 0)::int AS hard_count,
        COALESCE(sr.good_count, 0)::int AS good_count,
        COALESCE(sr.easy_count, 0)::int AS easy_count
      FROM session_events se
      LEFT JOIN session_reviews sr
        ON sr.session_id = se.session_id
      ORDER BY se.started_at DESC NULLS LAST, se.ended_at DESC NULLS LAST
      LIMIT $3 OFFSET $4
      `,
      [userId, days, limit, offset]
    );

    return result.rows.map((row) => ({
      sessionId: String(row.session_id),
      startedAt: row.started_at == null ? null : Number(row.started_at),
      endedAt: row.ended_at == null ? null : Number(row.ended_at),
      eventCount: Number(row.event_count ?? 0),
      distinctCardCount: Number(row.distinct_card_count ?? 0),
      reviewCount: Number(row.review_count ?? 0),
      againCount: Number(row.again_count ?? 0),
      hardCount: Number(row.hard_count ?? 0),
      goodCount: Number(row.good_count ?? 0),
      easyCount: Number(row.easy_count ?? 0),
    }));
  }

  async getSessionDetail(
    userId: string,
    sessionId: string,
    options?: { eventLimit?: number }
  ): Promise<StudySessionDetail | null> {
    const eventLimit = Math.max(1, Math.min(1000, options?.eventLimit ?? 300));
    const [metaResult, eventsResult, ratingsResult, sessionLogsResult] = await Promise.all([
      pool.query(
        `
        SELECT
          MIN(COALESCE(occurred_at_client, received_at_server))::bigint AS started_at,
          MAX(COALESCE(occurred_at_client, received_at_server))::bigint AS ended_at
        FROM study_events
        WHERE user_id = $1
          AND session_id = $2
        `,
        [userId, sessionId]
      ),
      pool.query(
        `
        SELECT
          id::text,
          event_type,
          card_id::text AS card_id,
          deck_id::text AS deck_id,
          COALESCE(occurred_at_client, received_at_server)::bigint AS event_time,
          sequence_in_session,
          payload_json
        FROM study_events
        WHERE user_id = $1
          AND session_id = $2
        ORDER BY COALESCE(sequence_in_session, 2147483647) ASC, event_time ASC, created_at ASC
        LIMIT $3
        `,
        [userId, sessionId, eventLimit]
      ),
      pool.query(
        `
        SELECT
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE rating = 1)::int AS again_count,
          COUNT(*) FILTER (WHERE rating = 2)::int AS hard_count,
          COUNT(*) FILTER (WHERE rating = 3)::int AS good_count,
          COUNT(*) FILTER (WHERE rating = 4)::int AS easy_count
        FROM review_logs
        WHERE user_id = $1
          AND session_id = $2
        `,
        [userId, sessionId]
      ),
      pool.query(
        `
        SELECT card_id::text AS card_id, rating, review_time::bigint AS review_time,
               scheduled_days, elapsed_days,
               stability_before, difficulty_before, stability_after, difficulty_after
        FROM review_logs
        WHERE user_id = $1 AND session_id = $2
        ORDER BY review_time ASC
        `,
        [userId, sessionId]
      ),
    ]);

    if (eventsResult.rows.length === 0) {
      return null;
    }

    const meta = metaResult.rows[0] ?? {};
    const rating = ratingsResult.rows[0] ?? {};
    const safeNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const sessionReviewLogs = (sessionLogsResult.rows ?? []).map((row: {
      card_id: string;
      rating: number;
      review_time: string | number;
      scheduled_days: number;
      elapsed_days: number;
      stability_before: unknown;
      difficulty_before: unknown;
      stability_after: unknown;
      difficulty_after: unknown;
    }) => ({
      cardId: String(row.card_id),
      rating: Number(row.rating),
      reviewTime: Number(row.review_time),
      scheduledDays: Number(row.scheduled_days),
      elapsedDays: Number(row.elapsed_days),
      stabilityBefore: safeNum(row.stability_before),
      difficultyBefore: safeNum(row.difficulty_before),
      stabilityAfter: safeNum(row.stability_after),
      difficultyAfter: safeNum(row.difficulty_after),
    }));

    return {
      sessionId,
      startedAt: meta.started_at == null ? null : Number(meta.started_at),
      endedAt: meta.ended_at == null ? null : Number(meta.ended_at),
      events: eventsResult.rows.map((row) => ({
        id: String(row.id),
        eventType: String(row.event_type),
        cardId: row.card_id == null ? null : String(row.card_id),
        deckId: row.deck_id == null ? null : String(row.deck_id),
        eventTime: Number(row.event_time),
        sequenceInSession: row.sequence_in_session == null ? null : Number(row.sequence_in_session),
        payload: (row.payload_json ?? {}) as Record<string, unknown>,
      })),
      ratings: {
        reviewCount: Number(rating.review_count ?? 0),
        againCount: Number(rating.again_count ?? 0),
        hardCount: Number(rating.hard_count ?? 0),
        goodCount: Number(rating.good_count ?? 0),
        easyCount: Number(rating.easy_count ?? 0),
      },
      sessionReviewLogs,
    };
  }
}
