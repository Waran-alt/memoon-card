/**
 * TypeScript shapes for DB rows and payloads. Source of truth for columns is Liquibase;
 * update this file when migrations add or rename columns.
 * Never return password_hash (or other secrets) from serializers — strip in toUserResponse etc.
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
  /** When true, card-creation UI shows knowledge textarea and "Add reversed card". */
  show_knowledge_on_card_creation?: boolean;
  /** Default categories for this deck (when loaded with categories). */
  categories?: { id: string; name: string }[];
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
  /** Historical: former learning-phase graduation timestamp; optional. */
  graduated_from_learning_at?: Date | null;
  /** Category IDs or summary attached to this card (when included in response) */
  category_ids?: string[];
  categories?: { id: string; name: string }[];
  /** Link to knowledge (learning unit); optional. */
  knowledge_id?: string | null;
  /** Neighbor card ids (undirected links in `card_links`). */
  linked_card_ids?: string[];
}

/** User-scoped category for tagging cards (e.g. vocabulary, grammar). */
export interface Category {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
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
  /** Question shown → answer revealed (ms), when tracked separately from review_duration */
  thinking_duration_ms?: number | null;
  shown_at?: number | null; // Client timestamp in milliseconds when card was shown
  revealed_at?: number | null; // Client timestamp in milliseconds when answer was revealed
  scheduled_days: number; // Interval scheduled for next review
  elapsed_days: number; // Days elapsed since last review
  stability_before: number | null;
  difficulty_before: number | null;
  retrievability_before: number | null;
  stability_after?: number | null;
  difficulty_after?: number | null;
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
  /** Minimum gap (minutes) between reverse-pair sides in a study session. */
  learning_min_interval_minutes?: number;
  /** When true, user can use knowledge textarea and reversed cards in UI. */
  knowledge_enabled?: boolean;
  /** UI theme: light, dark, monokai, or system (follow OS). */
  ui_theme?: string | null;
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

export type CardJourneyEventType =
  | 'card_created'
  | 'card_updated'
  | 'card_deleted'
  | 'card_shown'
  | 'answer_revealed'
  | 'rating_submitted'
  | 'rating_corrected'
  | 'importance_toggled';

export interface CardJourneyEvent {
  id: string;
  user_id: string;
  card_id: string;
  deck_id: string | null;
  event_type: CardJourneyEventType;
  event_time: number;
  actor: 'user' | 'system';
  source: 'ui' | 'review_service' | 'cards_route' | 'decks_route';
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

export interface CardFlag {
  id: string;
  card_id: string;
  user_id: string;
  reason: string;
  note: string | null;
  resolved: boolean;
  created_at: Date;
}

// Request/Response types
export interface CreateDeckRequest {
  title: string;
  description?: string;
  /** Optional category names to create (if not exist) and associate with the new deck. */
  categoryNames?: string[];
  /** When true, card-creation UI shows knowledge textarea and "Add reversed card". */
  show_knowledge_on_card_creation?: boolean;
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
  /** Optional link to user-scoped knowledge. */
  knowledge_id?: string | null;
}

/** Single card in a bulk create (pair) request. */
export interface BulkCreateCardItem {
  recto: string;
  verso: string;
  comment?: string | null;
  category_ids?: string[];
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

/** Single card in export payload (content-only or with metadata). */
export interface ExportCardItem {
  recto: string;
  verso: string;
  comment?: string | null;
  reverse?: boolean;
  recto_formula?: boolean;
  verso_formula?: boolean;
  /** Same value for both cards in a reverse pair; omit for single cards. */
  pairId?: string | null;
  /** Neighbor ids at export time (informational). */
  linked_card_ids?: string[];
  /** Shared id for a multi-card group: on import, every pair in the group gets a link. */
  link_group_id?: string | null;
  /** Present when format=full */
  stability?: number | null;
  difficulty?: number | null;
  next_review?: string | null;
  last_review?: string | null;
  is_important?: boolean;
}

/** Payload for import (validated by ImportCardsSchema). */
export interface ImportCardItem {
  recto: string;
  verso: string;
  comment?: string | null;
  reverse?: boolean;
  recto_formula?: boolean;
  verso_formula?: boolean;
  /** Two cards with the same pairId are imported and linked. */
  pairId?: string | null;
  /** Cards sharing the same link_group_id are imported and linked pairwise (each to each). */
  link_group_id?: string | null;
  stability?: number | null;
  difficulty?: number | null;
  next_review?: string | null;
  last_review?: string | null;
  is_important?: boolean;
}
