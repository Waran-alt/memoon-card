/**
 * Tests for sanitize utilities
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText, escapeHtml } from '../../utils/sanitize';

describe('sanitizeHtml', () => {
  it('should allow safe HTML tags', () => {
    const input = '<p>Hello <b>world</b></p>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<p>');
    expect(result).toContain('<b>');
    expect(result).toContain('world');
  });

  it('should remove script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('should remove event handlers', () => {
    const input = '<p onclick="alert(\'xss\')">Hello</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
  });

  it('should remove iframe tags', () => {
    const input = '<iframe src="evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe>');
  });

  it('should handle empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('should handle null/undefined', () => {
    // Testing edge cases with invalid input types
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('should allow links with href', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<a');
    expect(result).toContain('href');
  });

  it('should remove dangerous attributes', () => {
    const input = '<p style="color: red" onerror="alert(1)">Hello</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('style');
    expect(result).not.toContain('onerror');
  });
});

describe('sanitizeText', () => {
  it('should remove all HTML tags', () => {
    const input = '<p>Hello <b>world</b></p>';
    const result = sanitizeText(input);
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('should handle empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('should handle null/undefined', () => {
    // Testing edge cases with invalid input types
    expect(sanitizeText(null as unknown as string)).toBe('');
    expect(sanitizeText(undefined as unknown as string)).toBe('');
  });

  it('should preserve plain text', () => {
    const input = 'Plain text without HTML';
    expect(sanitizeText(input)).toBe(input);
  });
});

describe('escapeHtml', () => {
  it('should escape HTML entities', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    expect(escapeHtml("It's working")).toBe('It&#039;s working');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle null/undefined', () => {
    // Testing edge cases with invalid input types
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });
});
