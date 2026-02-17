# Journey Consistency Query Profile (2026 Q1)

Goal: capture `EXPLAIN ANALYZE` evidence for consistency-report query shape, then set index and retention guidance.

---

## How This Was Measured

- Fixture + query harness: `documentation/perf/journey_consistency_explain_fixture.sql`
- Environment:
  - Local Docker Postgres `postgres:17-alpine`
  - DB: `memoon_card_db`
  - Migrations applied through `014-consistency-and-review-indexes.xml`
- Fixture size:
  - `review_logs`: 30,000 rows (1 user, 30-day spread)
  - `card_journey_events`:
    - 30,000 `rating_submitted`
    - 90,000 `answer_revealed`

---

## Snapshot Results

### Baseline (unbounded future match)

- End-to-end query execution: **374.268 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **173.445 ms**
  - Hash semi-join on `journey_scope` x `answer_revealed` rows.

### Current optimized shape (bounded + answer scope CTE)

- End-to-end query execution: **583.602 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **377.419 ms**
  - Hash semi-join still chosen by planner; range bound did not flip to an index-driven strategy in this fixture.

---

## Why Current Shape Can Still Be Expensive

- Predicate currently compares sessions via `COALESCE(session_id::text, '')`, which reduces index friendliness.
- Planner prefers hashing large answer sets rather than probing by `(card_id, session_id, event_time)` bounds.
- Bounded window (`<= j.event_time + 300000`) helps semantics but does not guarantee better plans without a matching index and sargable predicates.

---

## Index Maintenance Policy (Read/Write Tradeoff)

Current relevant indexes:

- `idx_review_logs_user_review_date_id`
- `idx_cje_user_type_time_card_session`

Recommended next index (target `ordering_issues` probe pattern):

```sql
CREATE INDEX CONCURRENTLY idx_cje_answer_lookup
ON card_journey_events (user_id, card_id, session_id, event_time)
WHERE event_type = 'answer_revealed';
```

Tradeoff:

- **Read gain**: tighter lookup path for `answer_revealed` existence checks.
- **Write cost**: additional index maintenance on every `answer_revealed` insert.
- Policy: keep this index only if consistency report p95 materially improves under production-like volume and insert throughput remains within SLO.

---

## Retention Boundary Recommendation

- Default API/report window: **30 days**.
- Operational guidance:
  - keep on-demand checks at `days <= 30`
  - use separate offline/batch jobs for long-range audits (`90-180d`)
- Rationale: query cost scales with answer-event horizon; short operational windows keep latency predictable.

---

## Next Optimization Pass

- Add/prototype `idx_cje_answer_lookup`.
- Switch session predicate to `IS NOT DISTINCT FROM` (avoid `::text` cast path).
- Re-run profile and confirm p95 target under load fixture.
