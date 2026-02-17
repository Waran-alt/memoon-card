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

- End-to-end query execution: **305.428 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **139.380 ms**
  - Hash semi-join on `journey_scope` x `answer_revealed` rows.

### Current bounded `EXISTS` shape (before lateral switch)

- End-to-end query execution: **364.702 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **219.911 ms**
  - Hash semi-join with heavy join-filter work dominates.

### Shipped shape (bounded + `LATERAL ... LIMIT 1`)

- End-to-end query execution: **326.960 ms**
- Dominant cost:
  - `InitPlan 7` (`ordering_issues`): **116.606 ms**
  - Planner chooses nested-loop with memoized lateral probes and index scans.

---

## Why Current Shape Can Still Be Expensive

- Bounded `EXISTS` still tends toward hash semi-join with high join-filter overhead on this fixture.
- `LATERAL ... LIMIT 1` better aligns planner behavior with per-row probe semantics and cuts ordering-check cost materially.
- The existing general index `idx_card_journey_user_card_time` is currently the access path chosen for lateral probes.

---

## Index Maintenance Policy (Read/Write Tradeoff)

Current relevant indexes:

- `idx_review_logs_user_review_date_id`
- `idx_cje_user_type_time_card_session`
- `idx_cje_answer_lookup`

Candidate alternate index tested locally (not adopted in migrations):

```sql
CREATE INDEX CONCURRENTLY idx_cje_answer_lookup_time_first
ON card_journey_events (user_id, event_time, card_id, session_id)
WHERE event_type = 'answer_revealed';
```

Tradeoff:

- **Observed result**: planner did not choose the time-first candidate for the lateral plan in this fixture.
- **Write cost**: additional index maintenance on every `answer_revealed` insert; avoid overlapping variants unless proven in workload traces.
- Policy: keep the index set minimal until production telemetry shows a clear p95 benefit.

---

## Retention Boundary Recommendation

- Default API/report window: **30 days**.
- Operational guidance:
  - keep on-demand checks at `days <= 30`
  - use separate offline/batch jobs for long-range audits (`90-180d`)
- Rationale: query cost scales with answer-event horizon; short operational windows keep latency predictable.

---

## Next Optimization Pass

- Validate p95 with larger fixture sizes and production-like card/session skew.
- Add observability around consistency endpoint latency buckets by `days` window.
- Revisit index variants only if runtime telemetry shows sustained regressions.

---

## Decision State

- Decision: **implemented + monitor**.
- Rationale:
  - bounded lateral shape materially improves bounded-query cost versus bounded `EXISTS`;
  - fixture evidence is strong enough to ship;
  - final close-out depends on runtime p95 confirmation.

### Monitor Checklist (post-ship)

- track p50/p95/p99 for journey consistency endpoint by `days` bucket;
- alert on sustained p95 regression above agreed threshold;
- review planner/index usage from real workloads before adding any new index variants.
