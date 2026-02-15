# FSRS Optimizer Integration

This document describes how MemoOn Card integrates with the [FSRS Optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) for personalized weight optimization.

## Overview

The FSRS Optimizer is a Python library that uses personal spaced repetition review logs to refine FSRS algorithm parameters. By following the standard review log schema, MemoOn Card ensures compatibility with the optimizer and enables users to personalize their FSRS weights.

## Review Log Schema

Our `review_logs` table follows the FSRS Optimizer schema specification:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `card_id` | UUID | Unique identifier of the flashcard |
| `review_time` | BIGINT | Timestamp in milliseconds (UTC) |
| `review_rating` | INTEGER | User's rating: 1=Again, 2=Hard, 3=Good, 4=Easy |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `review_state` | INTEGER | Learning phase: 0=New, 1=Learning, 2=Review, 3=Relearning |
| `review_duration` | INTEGER | Time spent reviewing in milliseconds |

### Additional Fields (for internal use)

- `scheduled_days`: Interval scheduled for next review
- `elapsed_days`: Days elapsed since last review
- `stability_before`: Stability before review
- `difficulty_before`: Difficulty before review
- `retrievability_before`: Retrievability before review

## User Settings

The `user_settings` table includes fields required for FSRS Optimizer:

| Field | Type | Description |
|-------|------|-------------|
| `timezone` | VARCHAR(100) | IANA timezone (e.g., "America/New_York") |
| `day_start` | INTEGER | Hour (0-23) when user's day starts |

These fields are used to correctly assign reviews to days, especially when reviews are divided by sleep.

## Exporting Review Logs

To export review logs for FSRS Optimizer, use the following SQL query:

```sql
SELECT 
    card_id::text as card_id,
    review_time,
    rating as review_rating,
    COALESCE(review_state, 
        CASE 
            WHEN stability_before IS NULL THEN 0  -- New
            WHEN stability_before < 1 THEN 1      -- Learning
            WHEN rating = 1 THEN 3                 -- Relearning
            ELSE 2                                 -- Review
        END
    ) as review_state,
    review_duration
FROM review_logs
WHERE user_id = $1
ORDER BY review_time;
```

## CSV Format

The exported CSV should have the following columns:
- `card_id`
- `review_time` (milliseconds, UTC)
- `review_rating` (1-4)
- `review_state` (0-3, optional)
- `review_duration` (milliseconds, optional)

## Using FSRS Optimizer

### Option 1: Integrated API (Recommended)

The backend includes an optimization service that automatically calls the Python optimizer:

1. **Install FSRS Optimizer**:
   ```bash
   # Recommended: Use pipx
   pipx install fsrs-optimizer
   
   # Or use virtual environment
   python3 -m venv venv
   source venv/bin/activate
   pip install fsrs-optimizer
   ```

2. **Check optimization status**:
   ```bash
   GET /api/optimization/status
   ```

3. **Run optimization**:
   ```bash
   POST /api/optimization/optimize
   ```

The service will:
- Export review logs to CSV
- Run the Python optimizer
- Parse and update user weights automatically
- Store a versioned snapshot in `user_weight_snapshots` (Phase 2)

## Snapshot History and Rollback (Phase 2)

Each successful optimization now writes a versioned snapshot to `user_weight_snapshots` so you can inspect history and rollback safely.

### Snapshot fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | INTEGER | Monotonic version number per user |
| `weights` | DOUBLE PRECISION[] | FSRS weights used in that version |
| `target_retention` | DOUBLE PRECISION | Retention target tied to snapshot |
| `is_active` | BOOLEAN | Whether this is the currently active snapshot |
| `activated_by` | UUID | User who activated this snapshot |
| `activated_at` | TIMESTAMPTZ | Activation timestamp |
| `activation_reason` | VARCHAR(255) | Why this snapshot became active |
| `optimizer_method` | VARCHAR(128) | Optimizer command variant used |
| `review_count_used` | INTEGER | Total reviews used for this run |
| `new_reviews_since_last` | INTEGER | New reviews since previous optimization |
| `days_since_last_opt` | DOUBLE PRECISION | Days between optimization runs |

### API endpoints

- `GET /api/optimization/snapshots?limit=20`
  - Returns latest snapshot history for the current user.

- `POST /api/optimization/snapshots/:version/activate`
  - Activates a previous version and restores it to `user_settings`.
  - Optional JSON body:
    - `{ "reason": "quality regression detected" }`
  - If omitted, reason defaults to `manual_rollback`.

### Activation semantics

- Activation runs in a transaction:
  - marks current active snapshot inactive
  - marks selected snapshot active
  - restores selected weights/target retention into `user_settings`
- Optimizer-created snapshots are recorded with:
  - `activation_reason = "optimizer_run"`

### Option 2: Manual Export/Import

1. **Export review logs**:
   ```bash
   GET /api/optimization/export
   ```

2. **Run optimizer manually**:
   ```bash
   python -m fsrs_optimizer "revlog.csv"
   ```

3. **Import optimized weights** via user settings API

## References

- [FSRS Optimizer GitHub](https://github.com/open-spaced-repetition/fsrs-optimizer)
- [FSRS Algorithm Documentation](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
- [Optimization Mechanism](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-mechanism-of-optimization)
