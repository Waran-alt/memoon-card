-- Diagnostic Short-FSRS : les 2 dernières cartes créées et leurs révisions
-- Exécuter dans votre client PostgreSQL (psql, DBeaver, etc.)

-- 1) Les 2 cartes les plus récemment créées (non supprimées)
WITH last_two AS (
  SELECT id, user_id, deck_id, created_at
  FROM cards
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 2
)
SELECT
  c.id AS card_id,
  c.user_id,
  LEFT(c.recto, 40) AS recto_preview,
  c.created_at,
  c.stability,
  c.difficulty,
  c.short_stability_minutes,
  c.learning_review_count,
  c.graduated_from_learning_at,
  c.last_review,
  c.next_review,
  c.reverse_card_id,
  -- Incohérences possibles
  CASE WHEN c.stability IS NULL AND c.short_stability_minutes IS NULL AND c.last_review IS NOT NULL THEN 'BUG: revue sans état' ELSE 'ok' END AS state_check,
  CASE WHEN c.stability::text = 'NaN' OR c.difficulty::text = 'NaN' THEN 'NaN!' ELSE 'ok' END AS nan_check
FROM cards c
JOIN last_two l ON c.id = l.id
ORDER BY c.created_at DESC;

-- 2) Paramètres learning de l'utilisateur (pour les 2 cartes ci-dessus)
SELECT
  u.id AS user_id,
  us.learning_graduation_cap_days,
  us.learning_target_retention_short,
  us.learning_min_interval_minutes,
  us.learning_max_attempts_before_graduate,
  us.learning_apply_to_lapses
FROM user_settings us
JOIN users u ON u.id = us.user_id
WHERE u.id IN (SELECT user_id FROM cards WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 2);

-- 3) Tous les review_logs pour ces 2 cartes (ordre chronologique)
WITH last_two AS (
  SELECT id FROM cards WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 2
)
SELECT
  rl.id AS log_id,
  rl.card_id,
  rl.rating,
  to_timestamp(rl.review_time / 1000.0) AT TIME ZONE 'UTC' AS review_time_utc,
  rl.review_state,
  rl.stability_before,
  rl.stability_after,
  rl.difficulty_before,
  rl.difficulty_after,
  rl.scheduled_days,
  rl.elapsed_days,
  CASE rl.review_state
    WHEN 0 THEN 'New'
    WHEN 1 THEN 'Learning'
    WHEN 2 THEN 'Review'
    WHEN 3 THEN 'Relearning'
    ELSE '?'
  END AS state_label,
  CASE
    WHEN rl.stability_before::text = 'NaN' OR rl.stability_after::text = 'NaN' THEN 'NaN in stability'
    WHEN rl.difficulty_before::text = 'NaN' OR rl.difficulty_after::text = 'NaN' THEN 'NaN in difficulty'
    ELSE 'ok'
  END AS nan_check
FROM review_logs rl
JOIN last_two l ON rl.card_id = l.id
ORDER BY rl.card_id, rl.review_time;

-- 4) Cohérence carte vs dernier review_log (état attendu après dernière révision)
WITH last_two AS (
  SELECT id, user_id FROM cards WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 2
),
last_log AS (
  SELECT DISTINCT ON (card_id)
    card_id,
    review_state,
    stability_after,
    difficulty_after,
    review_time
  FROM review_logs rl
  JOIN last_two l ON rl.card_id = l.id
  ORDER BY card_id, review_time DESC
)
SELECT
  c.id AS card_id,
  c.stability AS card_stability,
  c.difficulty AS card_difficulty,
  c.short_stability_minutes AS card_short_stability_min,
  c.learning_review_count AS card_learning_count,
  c.graduated_from_learning_at,
  ll.review_state AS last_log_review_state,
  ll.stability_after AS last_log_stability_after,
  ll.difficulty_after AS last_log_difficulty_after,
  to_timestamp(ll.review_time / 1000.0) AT TIME ZONE 'UTC' AS last_review_time,
  CASE
    WHEN ll.review_state = 2 AND c.short_stability_minutes IS NOT NULL THEN 'BUG: gradué mais short_stability encore rempli'
    WHEN ll.review_state IN (0,1) AND c.short_stability_minutes IS NULL AND c.learning_review_count IS NULL THEN 'BUG: en learning mais short_stability NULL'
    WHEN ll.stability_after IS NOT NULL AND c.stability IS NULL THEN 'BUG: log a stability_after mais carte stability NULL'
    WHEN ll.stability_after::text = 'NaN' OR c.stability::text = 'NaN' THEN 'NaN détecté'
    ELSE 'coherent'
  END AS consistency
FROM cards c
JOIN last_two l ON c.id = l.id
LEFT JOIN last_log ll ON ll.card_id = c.id
ORDER BY c.created_at DESC;
