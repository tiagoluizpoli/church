import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toCycleDayKey, toLocalDayKey } from './date';

/**
 * Pinned to a west-of-UTC zone on purpose: the day-key rules these guard are
 * indistinguishable at UTC, which is exactly why the bug they encode survived.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('toLocalDayKey', () => {
  it('reads an instant in the local zone, not UTC', () => {
    // A church-local Monday is stored as local midnight → local 23:59, which in
    // UTC-3 straddles two UTC dates. Both bounds are still Monday Jan 4.
    expect(toLocalDayKey('2027-01-04T03:00:00.000Z')).toBe('2027-01-04');
    expect(toLocalDayKey('2027-01-05T02:59:59.999Z')).toBe('2027-01-04');
  });

  it('keeps an evening slot on the day it is served', () => {
    // 21:00 local Monday = 00:00Z Tuesday.
    expect(toLocalDayKey('2027-01-05T00:00:00.000Z')).toBe('2027-01-04');
  });

  it('passes a bare calendar day through without shifting it', () => {
    expect(toLocalDayKey('2027-01-04')).toBe('2027-01-04');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toLocalDayKey('2027-01-05T12:00:00.000Z')).toBe('2027-01-05');
  });
});

describe('toCycleDayKey', () => {
  it('keeps a UTC-midnight cycle bound on its intended day', () => {
    // `2027-01-01T00:00:00.000Z` names January 1 — it is not a moment in
    // church-local time, so it must not be read in the viewer's zone.
    expect(toCycleDayKey('2027-01-01T00:00:00.000Z')).toBe('2027-01-01');
    expect(toCycleDayKey('2027-01-31T00:00:00.000Z')).toBe('2027-01-31');
  });
});
