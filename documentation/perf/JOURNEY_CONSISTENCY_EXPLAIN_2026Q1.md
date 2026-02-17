# Journey Consistency Query Profile (2026 Q1)

Goal: capture `EXPLAIN ANALYZE` evidence for consistency-report query shape, then set index and retention guidance.

---

## How This Was Measured

- Fixture + query harness: `documentation/perf/journey_consistency_explain_fixture.sql`
- Environment:
  - Local Docker Postgres `postgres:17-alpine`
  - DB: `memoon_card_db`
  - Migrations applied through `015-cje-answer-lookup-index.xml`
- Fixture size:
  - `review_logs`: 30,000 rows (1 user, 30-day spread)
  - `card_journey_events`:
    - 30,000 `rating_submitted`
    - 90,000 `answer_revealed`

---

## Snapshot Results

### Baseline (unbounded future match)

- End-to-end query execution: **381.226 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **202.424 ms**
  - Hash semi-join on `journey_scope` x `answer_revealed` rows.

### Current optimized shape (bounded + correlated `EXISTS` + `IS NOT DISTINCT FROM`)

- End-to-end query execution: **400.292 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **213.401 ms**
  - Planner still prefers hash semi-join in this fixture; `idx_cje_answer_lookup` did not become the chosen access path.

---

## Why Current Shape Can Still Be Expensive

- Hash semi-join remains preferred over per-row index probes at this synthetic distribution.
- Window bound (`<= j.event_time + 300000`) improves semantics and reduced worst-case cost vs prior CTE shape, but does not yet guarantee index-first plans.
- With high overlap on `card_id`, join-filter work still dominates even after session predicate rewrite.

---

## Index Maintenance Policy (Read/Write Tradeoff)

Current relevant indexes:

- `idx_review_logs_user_review_date_id`
- `idx_cje_user_type_time_card_session`
- `idx_cje_answer_lookup`

Candidate alternate index to test (if planner still avoids `idx_cje_answer_lookup`):

```sql
CREATE INDEX CONCURRENTLY idx_cje_answer_lookup_time_first
ON card_journey_events (user_id, event_time, card_id, session_id)
WHERE event_type = 'answer_revealed';
```

Tradeoff:

- **Read gain**: may improve range-first filtering when time predicate is highly selective.
- **Write cost**: additional index maintenance on every `answer_revealed` insert; avoid multiple overlapping indexes long-term.
- Policy: keep only one answer-lookup index variant after p95 validation under production-like fixture.

---

## Retention Boundary Recommendation

- Default API/report window: **30 days**.
- Operational guidance:
  - keep on-demand checks at `days <= 30`
  - use separate offline/batch jobs for long-range audits (`90-180d`)
- Rationale: query cost scales with answer-event horizon; short operational windows keep latency predictable.

---

## Next Optimization Pass

- Compare current query against a `LATERAL ... LIMIT 1` probe variant.
- Test `idx_cje_answer_lookup_time_first` as an alternative leading column order.
- Confirm p95 target under a larger fixture and production-like cardinality distribution.
