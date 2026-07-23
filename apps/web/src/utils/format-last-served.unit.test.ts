import { describe, expect, it } from 'vitest';
import { formatLastServed } from './format-last-served';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

describe('formatLastServed', () => {
  it('reports a volunteer who has never served', () => {
    expect(formatLastServed({})).toBe('never served');
  });

  it('treats an unparseable date as never served', () => {
    expect(formatLastServed({ lastServedAt: 'not-a-date' })).toBe(
      'never served',
    );
  });

  it('names today and yesterday rather than counting them', () => {
    expect(formatLastServed({ lastServedAt: isoDaysAgo(0) })).toBe(
      'last served today',
    );
    expect(formatLastServed({ lastServedAt: isoDaysAgo(1) })).toBe(
      'last served yesterday',
    );
  });

  it('counts days inside the first week', () => {
    expect(formatLastServed({ lastServedAt: isoDaysAgo(6) })).toBe(
      'last served 6 days ago',
    );
  });

  it('counts whole weeks once a week has passed', () => {
    expect(formatLastServed({ lastServedAt: isoDaysAgo(7) })).toBe(
      'last served 1 week ago',
    );
    expect(formatLastServed({ lastServedAt: isoDaysAgo(35) })).toBe(
      'last served 5 weeks ago',
    );
    expect(formatLastServed({ lastServedAt: isoDaysAgo(41) })).toBe(
      'last served 5 weeks ago',
    );
  });

  it('switches to months past eight weeks, where weeks stop being useful', () => {
    expect(formatLastServed({ lastServedAt: isoDaysAgo(56) })).toBe(
      'last served 8 weeks ago',
    );
    expect(formatLastServed({ lastServedAt: isoDaysAgo(57) })).toBe(
      'last served 1 month ago',
    );
    expect(formatLastServed({ lastServedAt: isoDaysAgo(120) })).toBe(
      'last served 4 months ago',
    );
  });

  it('clamps a future date to today rather than reporting negative time', () => {
    expect(formatLastServed({ lastServedAt: isoDaysAgo(-3) })).toBe(
      'last served today',
    );
  });
});
