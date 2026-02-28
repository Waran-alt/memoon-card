/**
 * Frontend type definitions
 */

/** User shape from auth API (login/register/session/refresh) */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  /** Present when API returns it; used to show/hide admin UI and enforce access. */
  role?: 'user' | 'admin' | 'dev';
}

/** Auth API success response (login, register, refresh) */
export interface AuthApiResponse {
  success: true;
  data: {
    accessToken: string;
    user: AuthUser;
  };
}

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** When true, card-creation UI shows knowledge textarea and "Add reversed card". */
  show_knowledge_on_card_creation?: boolean;
  /** Default categories for this deck (when returned by API). */
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
  last_review: string | null;
  next_review: string;
  created_at: string;
  updated_at: string;
  /** Short-FSRS: stability in minutes while in learning; null when graduated. */
  short_stability_minutes?: number | null;
  /** Short-FSRS: number of learning reviews in current run; null when not in learning. */
  learning_review_count?: number | null;
  /** When card graduated from short-term learning (ISO date string). */
  graduated_from_learning_at?: string | null;
  /** When API includes categories */
  category_ids?: string[];
  categories?: { id: string; name: string }[];
  /** Link to knowledge (learning unit). */
  knowledge_id?: string | null;
  /** Other card in the reverse pair. */
  reverse_card_id?: string | null;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface CategoryWithCardCount extends Category {
  card_count?: number;
}

export interface ReviewResult {
  state: {
    stability: number;
    difficulty: number;
    lastReview: string | null;
    nextReview: string;
  };
  retrievability: number;
  interval: number;
  message: string;
  /** Set when short-FSRS path was used; show in study review only, not during card display */
  learningState?: {
    phase: 'learning' | 'graduated';
    nextReviewInMinutes?: number;
    nextReviewInDays?: number;
    learningReviewCount?: number;
    nextReviewTomorrow?: boolean;
  };
}

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
