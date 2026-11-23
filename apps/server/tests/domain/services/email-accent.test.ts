import { describe, expect, it } from 'vitest';
import {
  contrastOnWhite,
  emailAccentRule,
  emailAccentTint,
} from '@/domain/services/email-accent';

const MIN_RULE_CONTRAST = 3;

describe('emailAccentRule', () => {
  it('keeps an accent that already reaches 3:1 against white', () => {
    expect(emailAccentRule('#18181b')).toBe('#18181b');
  });

  it('darkens a pale accent until it reaches 3:1 against white', () => {
    const rule = emailAccentRule('#fde047');

    expect(rule).not.toBe('#fde047');
    expect(contrastOnWhite(rule)).toBeGreaterThanOrEqual(MIN_RULE_CONTRAST);
  });

  it('darkens even white to a visible line', () => {
    expect(contrastOnWhite(emailAccentRule('#ffffff'))).toBeGreaterThanOrEqual(
      MIN_RULE_CONTRAST,
    );
  });
});

describe('emailAccentTint', () => {
  it('mixes 10% accent into white', () => {
    expect(emailAccentTint('#000000')).toBe('#e6e6e6');
    expect(emailAccentTint('#ffffff')).toBe('#ffffff');
  });

  it('is always light enough for dark text', () => {
    expect(contrastOnWhite(emailAccentTint('#ff0000'))).toBeLessThan(1.2);
  });
});
