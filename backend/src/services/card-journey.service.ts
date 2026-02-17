import { pool } from '@/config/database';
import { CardJourneyEvent, CardJourneyEventType } from '@/types/database';

export interface CardJourneyEventInput {
  cardId: string;
  eventType: CardJourneyEventType;
  eventTime?: number;
  deckId?: string;
  sessionId?: string;
  actor?: 'user' | 'system';
  source?: 'ui' | 'review_service' | 'study_events' | 'cards_route' | 'decks_route';
  idempotencyKey: string;
  reviewLogId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
}

export interface CardJourneySummary {
  cardId: string;
  days: number;
  totalEvents: number;
  byEventType: Array<{ eventType: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  bySession: Array<{ sessionId: string; count: number; firstEventAt: number; lastEventAt: number }>;
}

export interface JourneyConsistencyReport {
  days: number;
  health: {
    level: 'healthy' | 'minor_issues' | 'needs_attention';
    mismatchRate: number;
    thresholds: {
      minor: number;
      major: number;
    };
  };
  totals: {
    reviewLogs: number;
    ratingJourneyEvents: number;
    duplicateRatingJourneyGroups: number;
    orderingIssues: number;
  };
  mismatches: {
    missingRatingJourneyEvents: number;
    duplicateRatingJourneyEvents: number;
    orderingIssues: number;
  };
  samples: {
    missingReviewLogIds: string[];
    duplicateReviewLogIds: string[];
    orderingIssueEventIds: string[];
  };
}

export class CardJourneyService {
  private static readonly JOURNEY_MISMATCH_MINOR_THRESHOLD = 0.01;
  private static readonly JOURNEY_MISMATCH_MAJOR_THRESHOLD = 0.05;
  async appendEvent(
    userId: string,
    event: CardJourneyEventInput,
    dbClient: { query: typeof pool.query } = pool
  ): Promise<void> {
    await this.appendEvents(userId, [event], dbClient);
  }

  async appendEvents(
    userId: string,
    events: CardJourneyEventInput[],
    dbClient: { query: typeof pool.query } = pool
  ): Promise<void> {
    if (events.length === 0) return;

    const valuesSql: string[] = [];
    const params: unknown[] = [];

    events.forEach((event, index) => {
      const base = index * 12;
      valuesSql.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}::jsonb)`
      );
      params.push(
        userId,
        event.cardId,
        event.deckId ?? null,
        event.sessionId ?? null,
        event.eventType,
        event.eventTime ?? Date.now(),
        event.actor ?? 'system',
        event.source ?? 'review_service',
        event.idempotencyKey,
        event.reviewLogId ?? null,
        event.causationId ?? null,
        JSON.stringify(event.payload ?? {})
      );
    });

    await dbClient.query(
      `INSERT INTO card_journey_events (
        user_id,
        card_id,
        deck_id,
        session_id,
        event_type,
        event_time,
        actor,
        source,
        idempotency_key,
        review_log_id,
        causation_id,
        payload_json
      )
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT (user_id, idempotency_key)
      DO NOTHING`,
      params
    );
  }

  async getCardHistory(
    userId: string,
    cardId: string,
    options?: { limit?: number; beforeEventTime?: number }
  ): Promise<CardJourneyEvent[]> {
    const limit = Math.max(1, Math.min(500, options?.limit ?? 100));
    const before = options?.beforeEventTime;
    const result = await pool.query<CardJourneyEvent>(
      `SELECT *
       FROM card_journey_events
       WHERE user_id = $1
         AND card_id = $2
         AND ($3::bigint IS NULL OR event_time < $3)
       ORDER BY event_time DESC, created_at DESC
       LIMIT $4`,
      [userId, cardId, before ?? null, limit]
    );
    return result.rows;
  }

  async getCardHistorySummary(
    userId: string,
    cardId: string,
    options?: { days?: number; sessionLimit?: number }
  ): Promise<CardJourneySummary> {
    const days = Math.max(1, Math.min(180, options?.days ?? 30));
    const sessionLimit = Math.max(1, Math.min(50, options?.sessionLimit ?? 10));

    const [totalResult, byTypeResult, byDayResult, bySessionResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_events
         FROM card_journey_events
         WHERE user_id = $1
           AND card_id = $2
           AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($3::int * INTERVAL '1 day'))) * 1000 AS BIGINT)`,
        [userId, cardId, days]
      ),
      pool.query(
        `SELECT event_type, COUNT(*)::int AS count
         FROM card_journey_events
         WHERE user_id = $1
           AND card_id = $2
           AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($3::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
         GROUP BY event_type
         ORDER BY count DESC, event_type ASC`,
        [userId, cardId, days]
      ),
      pool.query(
        `SELECT
           TO_CHAR(TO_TIMESTAMP(event_time / 1000.0), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count
         FROM card_journey_events
         WHERE user_id = $1
           AND card_id = $2
           AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($3::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
         GROUP BY day
         ORDER BY day DESC`,
        [userId, cardId, days]
      ),
      pool.query(
        `SELECT
           session_id::text AS session_id,
           COUNT(*)::int AS count,
           MIN(event_time)::bigint AS first_event_at,
           MAX(event_time)::bigint AS last_event_at
         FROM card_journey_events
         WHERE user_id = $1
           AND card_id = $2
           AND session_id IS NOT NULL
           AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($3::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
         GROUP BY session_id
         ORDER BY last_event_at DESC
         LIMIT $4`,
        [userId, cardId, days, sessionLimit]
      ),
    ]);

    const totalEvents = Number(totalResult.rows[0]?.total_events ?? 0);

    return {
      cardId,
      days,
      totalEvents,
      byEventType: byTypeResult.rows.map((row) => ({
        eventType: String(row.event_type),
        count: Number(row.count ?? 0),
      })),
      byDay: byDayResult.rows.map((row) => ({
        day: String(row.day),
        count: Number(row.count ?? 0),
      })),
      bySession: bySessionResult.rows.map((row) => ({
        sessionId: String(row.session_id),
        count: Number(row.count ?? 0),
        firstEventAt: Number(row.first_event_at ?? 0),
        lastEventAt: Number(row.last_event_at ?? 0),
      })),
    };
  }

  async getJourneyConsistencyReport(
    userId: string,
    options?: { days?: number; sampleLimit?: number }
  ): Promise<JourneyConsistencyReport> {
    const days = Math.max(1, Math.min(180, options?.days ?? 30));
    const sampleLimit = Math.max(1, Math.min(50, options?.sampleLimit ?? 20));

    const [totalsResult, missingResult, duplicateResult, orderingResult] = await Promise.all([
      pool.query(
        `
        WITH review_scope AS (
          SELECT id
          FROM review_logs
          WHERE user_id = $1
            AND review_date >= NOW() - ($2::int * INTERVAL '1 day')
        ),
        journey_scope AS (
          SELECT id, review_log_id, card_id, session_id, event_time
          FROM card_journey_events
          WHERE user_id = $1
            AND event_type = 'rating_submitted'
            AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($2::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
        ),
        missing_links AS (
          SELECT rl.id
          FROM review_scope rl
          LEFT JOIN journey_scope j
            ON j.review_log_id = rl.id
          WHERE j.id IS NULL
        ),
        duplicate_groups AS (
          SELECT review_log_id
          FROM journey_scope
          WHERE review_log_id IS NOT NULL
          GROUP BY review_log_id
          HAVING COUNT(*) > 1
        ),
        ordering_issues AS (
          SELECT j.id
          FROM journey_scope j
          JOIN LATERAL (
            SELECT 1
            FROM card_journey_events r
            WHERE r.user_id = $1
              AND r.event_type = 'answer_revealed'
              AND r.card_id = j.card_id
              AND r.session_id IS NOT DISTINCT FROM j.session_id
              AND r.event_time > j.event_time
              AND r.event_time <= j.event_time + 300000
            ORDER BY r.event_time ASC
            LIMIT 1
          ) matched ON TRUE
        )
        SELECT
          (SELECT COUNT(*)::int FROM review_scope) AS review_logs,
          (SELECT COUNT(*)::int FROM journey_scope) AS rating_journey_events,
          (SELECT COUNT(*)::int FROM missing_links) AS missing_rating_journey_events,
          (SELECT COUNT(*)::int FROM duplicate_groups) AS duplicate_rating_journey_groups,
          (SELECT COUNT(*)::int FROM ordering_issues) AS ordering_issues
        `,
        [userId, days]
      ),
      pool.query(
        `
        SELECT rl.id::text AS review_log_id
        FROM review_logs rl
        LEFT JOIN card_journey_events cje
          ON cje.user_id = rl.user_id
         AND cje.review_log_id = rl.id
         AND cje.event_type = 'rating_submitted'
        WHERE rl.user_id = $1
          AND rl.review_date >= NOW() - ($2::int * INTERVAL '1 day')
          AND cje.id IS NULL
        ORDER BY rl.review_date DESC
        LIMIT $3
        `,
        [userId, days, sampleLimit]
      ),
      pool.query(
        `
        SELECT review_log_id::text AS review_log_id
        FROM card_journey_events
        WHERE user_id = $1
          AND event_type = 'rating_submitted'
          AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($2::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
          AND review_log_id IS NOT NULL
        GROUP BY review_log_id
        HAVING COUNT(*) > 1
        ORDER BY review_log_id
        LIMIT $3
        `,
        [userId, days, sampleLimit]
      ),
      pool.query(
        `
        SELECT j.id::text AS event_id
        FROM card_journey_events j
        WHERE j.user_id = $1
          AND j.event_type = 'rating_submitted'
          AND j.event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - ($2::int * INTERVAL '1 day'))) * 1000 AS BIGINT)
          AND EXISTS (
            SELECT 1
            FROM card_journey_events r
            WHERE r.user_id = j.user_id
              AND r.card_id = j.card_id
              AND r.session_id IS NOT DISTINCT FROM j.session_id
              AND r.event_type = 'answer_revealed'
              AND r.event_time > j.event_time
              AND r.event_time <= j.event_time + 300000
          )
        ORDER BY j.event_time DESC
        LIMIT $3
        `,
        [userId, days, sampleLimit]
      ),
    ]);

    const totalsRow = totalsResult.rows[0] ?? {};
    const reviewLogs = Number(totalsRow.review_logs ?? 0);
    const ratingJourneyEvents = Number(totalsRow.rating_journey_events ?? 0);
    const missingRatingJourneyEvents = Number(totalsRow.missing_rating_journey_events ?? 0);
    const duplicateRatingJourneyGroups = Number(totalsRow.duplicate_rating_journey_groups ?? 0);
    const orderingIssues = Number(totalsRow.ordering_issues ?? 0);
    const totalMismatches =
      missingRatingJourneyEvents + duplicateRatingJourneyGroups + orderingIssues;
    const mismatchRate = reviewLogs > 0 ? totalMismatches / reviewLogs : 0;
    const healthLevel =
      mismatchRate >= CardJourneyService.JOURNEY_MISMATCH_MAJOR_THRESHOLD
        ? 'needs_attention'
        : mismatchRate >= CardJourneyService.JOURNEY_MISMATCH_MINOR_THRESHOLD
          ? 'minor_issues'
          : 'healthy';

    return {
      days,
      health: {
        level: healthLevel,
        mismatchRate,
        thresholds: {
          minor: CardJourneyService.JOURNEY_MISMATCH_MINOR_THRESHOLD,
          major: CardJourneyService.JOURNEY_MISMATCH_MAJOR_THRESHOLD,
        },
      },
      totals: {
        reviewLogs,
        ratingJourneyEvents,
        duplicateRatingJourneyGroups,
        orderingIssues,
      },
      mismatches: {
        missingRatingJourneyEvents,
        duplicateRatingJourneyEvents: duplicateRatingJourneyGroups,
        orderingIssues,
      },
      samples: {
        missingReviewLogIds: missingResult.rows.map((r) => String(r.review_log_id)),
        duplicateReviewLogIds: duplicateResult.rows.map((r) => String(r.review_log_id)),
        orderingIssueEventIds: orderingResult.rows.map((r) => String(r.event_id)),
      },
    };
  }
}
