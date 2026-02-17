\timing on

-- Repro fixture for journey consistency query profiling.
-- Target: local dev Postgres at port 5433 with all migrations applied.
-- This script seeds synthetic data for one user, runs baseline/optimized
-- EXPLAIN ANALYZE queries, then cleans up fixture rows.

DELETE FROM card_journey_events
WHERE user_id = '11111111-1111-4111-8111-111111111111'
  AND (idempotency_key LIKE 'perf-rating-%' OR idempotency_key LIKE 'perf-answer-%');
DELETE FROM review_logs WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM cards WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM decks WHERE id = '22222222-2222-4222-8222-222222222222';
DELETE FROM users WHERE id = '11111111-1111-4111-8111-111111111111';

INSERT INTO users (id, email, name, password_hash)
VALUES ('11111111-1111-4111-8111-111111111111', 'perf-consistency@example.com', 'perf-user', 'x');

INSERT INTO decks (id, user_id, title, description)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'perf deck', 'consistency perf fixture');

WITH card_source AS (
  SELECT gs, md5('card-' || gs::text) AS m
  FROM generate_series(1, 3000) gs
)
INSERT INTO cards (id, user_id, deck_id, recto, verso, reverse, next_review)
SELECT
  (substr(m,1,8) || '-' || substr(m,9,4) || '-' || substr(m,13,4) || '-' || substr(m,17,4) || '-' || substr(m,21,12))::uuid,
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'r-' || gs,
  'v-' || gs,
  true,
  NOW()
FROM card_source;

WITH review_source AS (
  SELECT gs, md5('review-' || gs::text) AS rm, md5('card-' || ((gs % 3000) + 1)::text) AS cm
  FROM generate_series(1, 30000) gs
)
INSERT INTO review_logs (
  id, card_id, user_id, rating, scheduled_days, elapsed_days, review_date, review_time,
  stability_before, difficulty_before, retrievability_before
)
SELECT
  (substr(rm,1,8) || '-' || substr(rm,9,4) || '-' || substr(rm,13,4) || '-' || substr(rm,17,4) || '-' || substr(rm,21,12))::uuid,
  (substr(cm,1,8) || '-' || substr(cm,9,4) || '-' || substr(cm,13,4) || '-' || substr(cm,17,4) || '-' || substr(cm,21,12))::uuid,
  '11111111-1111-4111-8111-111111111111',
  ((gs % 4) + 1),
  1,
  1,
  NOW() - ((gs % 30) * INTERVAL '1 day'),
  CAST(EXTRACT(EPOCH FROM (NOW() - ((gs % 30) * INTERVAL '1 day'))) * 1000 AS BIGINT),
  1,
  5,
  0.9
FROM review_source;

WITH review_source AS (
  SELECT gs, md5('review-' || gs::text) AS rm, md5('card-' || ((gs % 3000) + 1)::text) AS cm, md5('session-' || ((gs % 1200) + 1)::text) AS sm
  FROM generate_series(1, 30000) gs
)
INSERT INTO card_journey_events (
  user_id, card_id, deck_id, session_id, event_type, event_time,
  actor, source, idempotency_key, review_log_id, causation_id, payload_json
)
SELECT
  '11111111-1111-4111-8111-111111111111',
  (substr(cm,1,8) || '-' || substr(cm,9,4) || '-' || substr(cm,13,4) || '-' || substr(cm,17,4) || '-' || substr(cm,21,12))::uuid,
  '22222222-2222-4222-8222-222222222222',
  (substr(sm,1,8) || '-' || substr(sm,9,4) || '-' || substr(sm,13,4) || '-' || substr(sm,17,4) || '-' || substr(sm,21,12))::uuid,
  'rating_submitted',
  CAST(EXTRACT(EPOCH FROM (NOW() - ((gs % 30) * INTERVAL '1 day'))) * 1000 AS BIGINT),
  'user',
  'study_events',
  'perf-rating-' || gs,
  (substr(rm,1,8) || '-' || substr(rm,9,4) || '-' || substr(rm,13,4) || '-' || substr(rm,17,4) || '-' || substr(rm,21,12))::uuid,
  NULL,
  '{}'::jsonb
FROM review_source;

WITH answer_source AS (
  SELECT gs,
         md5('card-' || ((gs % 3000) + 1)::text) AS cm,
         md5('session-' || ((gs % 1200) + 1)::text) AS sm,
         (CASE WHEN (gs % 2) = 0 THEN 120000 ELSE 86400000 END) AS delta_ms
  FROM generate_series(1, 90000) gs
)
INSERT INTO card_journey_events (
  user_id, card_id, deck_id, session_id, event_type, event_time,
  actor, source, idempotency_key, review_log_id, causation_id, payload_json
)
SELECT
  '11111111-1111-4111-8111-111111111111',
  (substr(cm,1,8) || '-' || substr(cm,9,4) || '-' || substr(cm,13,4) || '-' || substr(cm,17,4) || '-' || substr(cm,21,12))::uuid,
  '22222222-2222-4222-8222-222222222222',
  (substr(sm,1,8) || '-' || substr(sm,9,4) || '-' || substr(sm,13,4) || '-' || substr(sm,17,4) || '-' || substr(sm,21,12))::uuid,
  'answer_revealed',
  CAST(EXTRACT(EPOCH FROM (NOW() - ((gs % 30) * INTERVAL '1 day'))) * 1000 AS BIGINT) + delta_ms,
  'user',
  'study_events',
  'perf-answer-' || gs,
  NULL,
  NULL,
  '{}'::jsonb
FROM answer_source;

ANALYZE review_logs;
ANALYZE card_journey_events;

-- Baseline: unbounded answer_revealed future join.
EXPLAIN (ANALYZE, BUFFERS)
WITH review_scope AS (
  SELECT id
  FROM review_logs
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND review_date >= NOW() - (30 * INTERVAL '1 day')
),
journey_scope AS (
  SELECT id, review_log_id, card_id, session_id, event_time
  FROM card_journey_events
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND event_type = 'rating_submitted'
    AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - (30 * INTERVAL '1 day'))) * 1000 AS BIGINT)
),
missing_links AS (
  SELECT rl.id
  FROM review_scope rl
  LEFT JOIN journey_scope j ON j.review_log_id = rl.id
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
  WHERE EXISTS (
    SELECT 1
    FROM card_journey_events r
    WHERE r.user_id = '11111111-1111-4111-8111-111111111111'
      AND r.event_type = 'answer_revealed'
      AND r.card_id = j.card_id
      AND COALESCE(r.session_id::text, '') = COALESCE(j.session_id::text, '')
      AND r.event_time > j.event_time
  )
)
SELECT
  (SELECT COUNT(*)::int FROM review_scope) AS review_logs,
  (SELECT COUNT(*)::int FROM journey_scope) AS rating_journey_events,
  (SELECT COUNT(*)::int FROM missing_links) AS missing_rating_journey_events,
  (SELECT COUNT(*)::int FROM duplicate_groups) AS duplicate_rating_journey_groups,
  (SELECT COUNT(*)::int FROM ordering_issues) AS ordering_issues;

-- Optimized (current): bounded 5-minute window + correlated EXISTS.
EXPLAIN (ANALYZE, BUFFERS)
WITH review_scope AS (
  SELECT id
  FROM review_logs
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND review_date >= NOW() - (30 * INTERVAL '1 day')
),
journey_scope AS (
  SELECT id, review_log_id, card_id, session_id, event_time
  FROM card_journey_events
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND event_type = 'rating_submitted'
    AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - (30 * INTERVAL '1 day'))) * 1000 AS BIGINT)
),
missing_links AS (
  SELECT rl.id
  FROM review_scope rl
  LEFT JOIN journey_scope j ON j.review_log_id = rl.id
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
  WHERE EXISTS (
    SELECT 1
    FROM card_journey_events r
    WHERE r.card_id = j.card_id
      AND r.user_id = '11111111-1111-4111-8111-111111111111'
      AND r.event_type = 'answer_revealed'
      AND r.session_id IS NOT DISTINCT FROM j.session_id
      AND r.event_time > j.event_time
      AND r.event_time <= j.event_time + 300000
  )
)
SELECT
  (SELECT COUNT(*)::int FROM review_scope) AS review_logs,
  (SELECT COUNT(*)::int FROM journey_scope) AS rating_journey_events,
  (SELECT COUNT(*)::int FROM missing_links) AS missing_rating_journey_events,
  (SELECT COUNT(*)::int FROM duplicate_groups) AS duplicate_rating_journey_groups,
  (SELECT COUNT(*)::int FROM ordering_issues) AS ordering_issues;

-- Candidate: bounded window + LATERAL probe.
EXPLAIN (ANALYZE, BUFFERS)
WITH review_scope AS (
  SELECT id
  FROM review_logs
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND review_date >= NOW() - (30 * INTERVAL '1 day')
),
journey_scope AS (
  SELECT id, review_log_id, card_id, session_id, event_time
  FROM card_journey_events
  WHERE user_id = '11111111-1111-4111-8111-111111111111'
    AND event_type = 'rating_submitted'
    AND event_time >= CAST(EXTRACT(EPOCH FROM (NOW() - (30 * INTERVAL '1 day'))) * 1000 AS BIGINT)
),
missing_links AS (
  SELECT rl.id
  FROM review_scope rl
  LEFT JOIN journey_scope j ON j.review_log_id = rl.id
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
    WHERE r.user_id = '11111111-1111-4111-8111-111111111111'
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
  (SELECT COUNT(*)::int FROM ordering_issues) AS ordering_issues;

-- Cleanup.
DELETE FROM card_journey_events
WHERE user_id = '11111111-1111-4111-8111-111111111111'
  AND (idempotency_key LIKE 'perf-rating-%' OR idempotency_key LIKE 'perf-answer-%');
DELETE FROM review_logs WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM cards WHERE user_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM decks WHERE id = '22222222-2222-4222-8222-222222222222';
DELETE FROM users WHERE id = '11111111-1111-4111-8111-111111111111';
