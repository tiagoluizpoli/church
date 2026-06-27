import { describe, expect, it } from 'vitest';
import { formatVolunteerName } from './format-volunteer-name';

describe('formatVolunteerName (T097)', () => {
  describe('Happy Path', () => {
    it('formats a two-token name as "First L."', () => {
      expect(formatVolunteerName('John Doe')).toBe('John D.');
    });

    it('uses the last token initial for multi-token names', () => {
      expect(formatVolunteerName('Mary Jane Watson')).toBe('Mary W.');
    });

    it('uppercases a lowercase last initial', () => {
      expect(formatVolunteerName('john doe')).toBe('john D.');
    });
  });

  describe('Edge Cases', () => {
    it('returns a single-token name unchanged', () => {
      expect(formatVolunteerName('Madonna')).toBe('Madonna');
    });

    it('collapses extra internal whitespace', () => {
      expect(formatVolunteerName('John   Doe')).toBe('John D.');
    });

    it('trims surrounding whitespace', () => {
      expect(formatVolunteerName('  John Doe  ')).toBe('John D.');
    });
  });

  describe('Invalid / Empty Input', () => {
    it('returns empty string for empty input', () => {
      expect(formatVolunteerName('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(formatVolunteerName('   ')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(formatVolunteerName(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatVolunteerName(undefined)).toBe('');
    });
  });
});
