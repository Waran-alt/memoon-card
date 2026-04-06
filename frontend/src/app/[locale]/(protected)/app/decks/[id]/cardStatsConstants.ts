/**
 * Product thresholds for card follow-up copy (retrievability buckets).
 * Adjust these to tune how often users see “strong / medium / weaker memory” wording.
 */
export const CARD_STATS_R_HIGH_MIN = 0.85;
export const CARD_STATS_R_MEDIUM_MIN = 0.55;

/** Max review logs requested for the history chart (API cap). */
export const CARD_REVIEW_LOGS_FETCH_LIMIT = 100;

/** Deck stats modal: max cards to show line charts for (matches API default). */
export const DECK_STATS_PER_CARD_CHART_MAX_CARDS = 80;
