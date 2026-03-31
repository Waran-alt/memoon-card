/**
 * Server-side HTML cleanup for user-authored fields (cards, decks, knowledge) before DB storage.
 * Rich text in API responses is later rendered by React as text or trusted pipeline; this remains the main XSS gate at write time.
 */

import DOMPurify from 'isomorphic-dompurify';

/** Strip dangerous markup; ALLOWED_* is the write-time XSS contract (align with frontend rendering, grid 4.3). */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(input, {
    // Allowed HTML tags (minimal set for flashcard content)
    ALLOWED_TAGS: [
      'b', 'strong',      // Bold
      'i', 'em',          // Italic
      'u',                // Underline
      'p', 'br',          // Paragraphs and line breaks
      'ul', 'ol', 'li',   // Lists
      'h1', 'h2', 'h3',   // Headings
      'a',                // Links
      'code', 'pre',      // Code blocks
      'blockquote',       // Quotes
    ],
    // Allowed attributes
    ALLOWED_ATTR: [
      'href',             // Links
      'title',            // Tooltips
      'target',           // Link target
      'rel',              // Link rel (for security)
    ],
    // Disable data attributes (can be used for XSS)
    ALLOW_DATA_ATTR: false,
    // Keep relative URLs safe
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Return plain text if all HTML is stripped
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  });
}

/** Strip all tags; use for fields stored as plain text.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/** Entity-escape for contexts where markup must not run (defense in depth if not using React text nodes only).
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') {
    return '';
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
