/**
 * Database type definitions matching the schema
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'dev';
  /** Set on insert; never returned in API responses */
  password_hash?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  /** Set when deck is soft-deleted; cards and study data keep linking to the row */
  deleted_at?: Date | null;
}

export interface Card {
  id: string;
  user_id: string;
  deck_id: string;
  recto: string;
  verso: string;
  comment: string | null;
  recto_image: string | null;
  verso_image: string | null;
  recto_formula: boolean;
  verso_formula: boolean;
  reverse: boolean;
  stability: number | null;
  difficulty: number | null;
  is_important?: boolean;
  importance_updated_at?: Date | null;
  last_review: Date | null;
  next_review: Date;
  /** When retrievability drops below 0.1 (critical); used for fast risk counts */
  critical_before?: Date | null;
  /** When retrievability drops below 0.5 (high-risk); used for fast risk counts */
  high_risk_before?: Date | null;
  created_at: Date;
  updated_at: Date;
  /** Set when card is soft-deleted; study data (review_logs, etc.) keeps linking to the row */
  deleted_at?: Date | null;
}

/**
 * Review Log interface matching FSRS Optimizer schema
 * 
 * Schema reference: https://github.com/open-spaced-repetition/fsrs-optimizer
 * 
 * Required for FSRS optimization:
 * - card_id: Unique identifier of the flashcard
 * - review_time: Timestamp in milliseconds (UTC)
 * - review_rating: User's rating (1=Again, 2=Hard, 3=Good, 4=Easy)
 * - review_state: Learning phase (0=New, 1=Learning, 2=Review, 3=Relearning) - optional
 * - review_duration: Time spent reviewing in milliseconds - optional
 */
export interface ReviewLog {
  id: string;
  card_id: string;
  user_id: string;
  rating: 1 | 2 | 3 | 4;
  review_time: number; // Timestamp in milliseconds (UTC) - matches FSRS Optimizer schema
  review_state?: 0 | 1 | 2 | 3; // 0=New, 1=Learning, 2=Review, 3=Relearning
  review_duration?: number; // Time spent reviewing in milliseconds
  shown_at?: number | null; // Client timestamp in milliseconds when card was shown
  revealed_at?: number | null; // Client timestamp in milliseconds when answer was revealed
  session_id?: string | null; // Groups reviews from a single study session
  loop_iteration?: number | null;
  adaptive_gap_seconds?: number | null;
  fatigue_score_at_review?: number | null;
  importance_mode?: string | null;
  policy_decision_code?: string | null;
  scheduled_days: number; // Interval scheduled for next review
  elapsed_days: number; // Days elapsed since last review
  stability_before: number | null;
  difficulty_before: number | null;
  retrievability_before: number | null;
}

export interface UserFsrsDailyMetric {
  id: string;
  user_id: string;
  metric_date: string;
  review_count: number;
  pass_count: number;
  fail_count: number;
  avg_predicted_recall: number | null;
  observed_recall_rate: number | null;
  brier_score: number | null;
  mean_review_duration_ms: number | null;
  p50_review_duration_ms: number | null;
  p90_review_duration_ms: number | null;
  avg_elapsed_days: number | null;
  avg_scheduled_days: number | null;
  session_count: number | null;
  updated_at: Date;
}

export interface UserFsrsSessionMetric {
  id: string;
  user_id: string;
  session_id: string;
  session_date: string;
  session_started_at: number | null;
  session_ended_at: number | null;
  review_count: number;
  pass_count: number;
  fail_count: number;
  avg_predicted_recall: number | null;
  observed_recall_rate: number | null;
  brier_score: number | null;
  mean_review_duration_ms: number | null;
  fatigue_slope: number | null;
  updated_at: Date;
}

export interface UserSettings {
  user_id: string;
  fsrs_weights: number[]; // 21 weights for FSRS v6
  target_retention: number;
  last_optimized_at: Date | null;
  review_count_since_optimization: number;
  updated_at: Date;
  // FSRS Optimizer requirements
  timezone?: string; // IANA timezone (e.g., "America/New_York")
  day_start?: number; // Hour (0-23) when user's day starts
  study_intensity_mode?: 'light' | 'default' | 'intensive';
}

export interface RefreshTokenSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  last_used_at: Date;
  created_at: Date;
}

export type StudyEventType =
  | 'session_start'
  | 'session_end'
  | 'card_shown'
  | 'answer_revealed'
  | 'rating_submitted'
  | 'short_loop_decision'
  | 'importance_toggled';

export interface StudyEvent {
  id: string;
  user_id: string;
  deck_id: string | null;
  card_id: string | null;
  session_id: string | null;
  client_event_id: string | null;
  event_type: StudyEventType;
  event_version: number;
  occurred_at_client: number | null;
  received_at_server: number;
  sequence_in_session: number | null;
  policy_version: string;
  payload_json: Record<string, unknown>;
  created_at: Date;
}

export interface CardDailyLoopState {
  id: string;
  user_id: string;
  card_id: string;
  loop_date: string;
  session_id: string | null;
  is_active: boolean;
  iteration: number;
  reviews_today: number;
  consecutive_successes: number;
  consecutive_failures: number;
  last_rating: number | null;
  last_gap_seconds: number | null;
  next_short_loop_at: Date | null;
  fatigue_score: number | null;
  importance_multiplier: number | null;
  difficulty_multiplier: number | null;
  confidence_multiplier: number | null;
  created_at: Date;
  updated_at: Date;
}

export type CardJourneyEventType =
  | 'card_created'
  | 'card_updated'
  | 'card_deleted'
  | 'card_shown'
  | 'answer_revealed'
  | 'rating_submitted'
  | 'short_loop_decision'
  | 'importance_toggled';

export interface CardJourneyEvent {
  id: string;
  user_id: string;
  card_id: string;
  deck_id: string | null;
  session_id: string | null;
  event_type: CardJourneyEventType;
  event_time: number;
  actor: 'user' | 'system';
  source: 'ui' | 'review_service' | 'study_events' | 'cards_route' | 'decks_route';
  idempotency_key: string;
  review_log_id: string | null;
  causation_id: string | null;
  policy_version: string;
  payload_json: Record<string, unknown>;
  created_at: Date;
}

export interface UserWeightSnapshot {
  id: string;
  user_id: string;
  version: number;
  weights: number[];
  target_retention: number | null;
  source: string;
  review_count_used: number | null;
  new_reviews_since_last: number | null;
  days_since_last_opt: number | null;
  optimizer_method: string | null;
  is_active: boolean;
  activated_by: string | null;
  activated_at: Date | null;
  activation_reason: string | null;
  created_at: Date;
}

export interface CardManagementView {
  id: string;
  card_id: string;
  user_id: string;
  action: 'edit' | 'duplicate_check' | 'filter' | 'tag' | 'other';
  revealed_at: Date;
  revealed_for_seconds: number;
  content_changed: boolean;
  change_percent: number | null;
  fuzzing_applied: boolean;
  fuzzing_hours: number | null;
  created_at: Date;
}

export interface CardFlag {
  id: string;
  card_id: string;
  user_id: string;
  reason: string;
  note: string | null;
  flagged_during_session_id: string | null;
  resolved: boolean;
  created_at: Date;
}

// Request/Response types
export interface CreateDeckRequest {
  title: string;
  description?: string;
}

export interface CreateCardRequest {
  recto: string;
  verso: string;
  comment?: string;
  recto_image?: string;
  verso_image?: string;
  recto_formula?: boolean;
  verso_formula?: boolean;
  reverse?: boolean;
}

export interface UpdateCardRequest {
  recto?: string;
  verso?: string;
  comment?: string;
  recto_image?: string;
  verso_image?: string;
  recto_formula?: boolean;
  verso_formula?: boolean;
  reverse?: boolean;
}

export interface ReviewCardRequest {
  rating: 1 | 2 | 3 | 4;
}

export interface CardWithState extends Card {
  retrievability?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
