-- Diagnostic : pourquoi la prochaine révision n'avance pas
-- Cartes récemment révisées : état carte vs dernier review_log, incohérences.
-- Exécuter dans votre client PostgreSQL (psql, DBeaver, etc.)

-- 1) Cartes avec au moins une révision récente (derniers 7 jours), tri par dernière révision
WITH recent_reviews AS (
  SELECT
    rl.card_id,
    rl.user_id,
    rl.review_time,
    rl.rating,
    rl.review_state,
    rl.scheduled_days,
    rl.stability_after,
    rl.difficulty_after,
    ROW_NUMBER() OVER (PARTITION BY rl.card_id ORDER BY rl.review_time DESC) AS rn
  FROM review_logs rl
  WHERE rl.review_time >= (EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000)::bigint
),
last_review_per_card AS (
  SELECT * FROM recent_reviews WHERE rn = 1
)
SELECT
  c.id AS card_id,
  LEFT(c.recto, 30) AS recto_preview,
  to_timestamp(lr.review_time / 1000.0) AT TIME ZONE 'UTC' AS last_review_time,
  lr.rating AS last_rating,
  lr.review_state AS last_review_state,
  lr.scheduled_days AS last_scheduled_days,
  lr.stability_after AS last_stability_after,
  c.last_review AS card_last_review,
  c.next_review AS card_next_review,
  c.stability AS card_stability,
  c.difficulty AS card_difficulty,
  c.short_stability_minutes AS card_short_stability_min,
  c.learning_review_count AS card_learning_count,
  -- Prochaine révision attendue (approx) : last_review_time + scheduled_days
  (to_timestamp(lr.review_time / 1000.0) AT TIME ZONE 'UTC' + (lr.scheduled_days || ' days')::interval) AS expected_next_review_approx,
  -- Incohérences
  CASE
    WHEN c.next_review IS NULL THEN 'BUG: next_review NULL'
    WHEN c.next_review < NOW() AND lr.review_time > (EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 day')) * 1000)::bigint THEN 'ALERTE: next_review dans le passé'
    WHEN c.last_review IS NULL AND lr.review_time > 0 THEN 'BUG: last_review NULL mais des logs existent'
    WHEN c.stability::text = 'NaN' OR c.difficulty::text = 'NaN' THEN 'NaN dans carte'
    WHEN lr.stability_after::text = 'NaN' THEN 'NaN dans log'
    ELSE '—'
  END AS check_result
FROM cards c
JOIN last_review_per_card lr ON c.id = lr.card_id AND c.user_id = lr.user_id
WHERE c.deleted_at IS NULL
ORDER BY lr.review_time DESC
LIMIT 20;

-- 2) Détail des derniers review_logs pour ces cartes (pour voir si scheduled_days / state progressent)
WITH recent_cards AS (
  SELECT card_id
  FROM (
    SELECT card_id, MAX(review_time) AS last_t
    FROM review_logs
    WHERE review_time >= (EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000)::bigint
    GROUP BY card_id
    ORDER BY last_t DESC
    LIMIT 10
  ) t
)
SELECT
  rl.card_id,
  to_timestamp(rl.review_time / 1000.0) AT TIME ZONE 'UTC' AS review_time_utc,
  rl.rating,
  rl.review_state,
  rl.scheduled_days,
  rl.stability_before,
  rl.stability_after,
  rl.difficulty_before,
  rl.difficulty_after
FROM review_logs rl
WHERE rl.card_id IN (SELECT card_id FROM recent_cards)
ORDER BY rl.card_id, rl.review_time ASC;

-- 3) Comparaison directe : next_review de la carte vs (dernier review_time + scheduled_days)
WITH last_log AS (
  SELECT DISTINCT ON (card_id)
    card_id,
    user_id,
    review_time,
    scheduled_days,
    review_state
  FROM review_logs
  ORDER BY card_id, review_time DESC
)
SELECT
  c.id AS card_id,
  to_timestamp(ll.review_time / 1000.0) AT TIME ZONE 'UTC' AS last_log_time,
  ll.scheduled_days,
  (to_timestamp(ll.review_time / 1000.0) AT TIME ZONE 'UTC' + (ll.scheduled_days || ' days')::interval) AS expected_next,
  c.next_review AS actual_next,
  c.last_review AS card_last_review,
  CASE
    WHEN c.next_review IS NULL THEN 'next_review NULL'
    WHEN c.next_review < to_timestamp(ll.review_time / 1000.0) THEN 'next_review avant dernier log!'
    WHEN ABS(EXTRACT(EPOCH FROM (c.next_review - (to_timestamp(ll.review_time / 1000.0) AT TIME ZONE 'UTC' + (ll.scheduled_days || ' days')::interval)))) > 86400 THEN 'écart > 1 jour'
    ELSE 'ok'
  END AS coherence
FROM cards c
JOIN last_log ll ON c.id = ll.card_id AND c.user_id = ll.user_id
WHERE c.deleted_at IS NULL
  AND ll.review_time >= (EXTRACT(EPOCH FROM (NOW() - INTERVAL '14 days')) * 1000)::bigint
ORDER BY ll.review_time DESC
LIMIT 25;
