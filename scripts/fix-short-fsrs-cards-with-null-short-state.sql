-- Corrige les cartes qui ont été révisées en phase learning (review_state 0 ou 1)
-- mais n'ont pas short_stability_minutes / learning_review_count remplis
-- (bug : le chemin FSRS classique a été utilisé au lieu de Short-FSRS).
--
-- Valeurs initiales Short-FSRS par rating : Again=5, Hard=15, Good=30, Easy=60 min.
-- On prend la première révision de chaque carte pour déterminer le rating.

-- Variante pour les 2 cartes spécifiques (IDs fournis par l'utilisateur)
WITH first_review AS (
  SELECT DISTINCT ON (card_id)
    card_id,
    CASE rating
      WHEN 1 THEN 5
      WHEN 2 THEN 15
      WHEN 3 THEN 30
      WHEN 4 THEN 60
      ELSE 30
    END AS init_s
  FROM review_logs
  WHERE card_id IN (
    '324b0961-520b-4365-ad9e-15d552d93589',
    'aaa2657b-e4e9-4dd0-8c3b-c3952d558bd8'
  )
  ORDER BY card_id, review_time ASC
)
UPDATE cards c
SET
  short_stability_minutes = fr.init_s,
  learning_review_count = 1,
  updated_at = CURRENT_TIMESTAMP
FROM first_review fr
WHERE c.id = fr.card_id;
