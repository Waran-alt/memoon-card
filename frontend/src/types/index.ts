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
  shortLoopDecision?: {
    enabled: boolean;
    action: 'reinsert_today' | 'defer' | 'graduate_to_fsrs';
    reason: string;
    nextGapSeconds: number | null;
    loopIteration: number;
    fatigueScore: number | null;
    importanceMode: 'light' | 'default' | 'intensive';
  };
}

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
