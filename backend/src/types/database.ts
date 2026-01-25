/**
 * Database type definitions matching the schema
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
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
  last_review: Date | null;
  next_review: Date;
  created_at: Date;
  updated_at: Date;
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
  scheduled_days: number; // Interval scheduled for next review
  elapsed_days: number; // Days elapsed since last review
  stability_before: number | null;
  difficulty_before: number | null;
  retrievability_before: number | null;
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
