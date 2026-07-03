import { describe, expect, it } from 'vitest';
import { InvalidDateRangeError } from '../../../src/domain/errors/invalid-date-range';
import { DateRange } from '../../../src/domain/value-objects/date-range';

describe('DateRange', () => {
  const start = new Date('2026-07-01T10:00:00Z');
  const end = new Date('2026-07-01T12:00:00Z');

  it('rejects reversed and zero-length ranges', () => {
    expect(() => DateRange.create({ start, end: start })).toThrow(
      InvalidDateRangeError,
    );
    expect(() => DateRange.create({ start: end, end: start })).toThrow(
      InvalidDateRangeError,
    );
  });

  it('contains both boundaries and excludes dates outside them', () => {
    const range = DateRange.create({ start, end });

    expect(range.contains({ date: start })).toBe(true);
    expect(range.contains({ date: end })).toBe(true);
    expect(range.contains({ date: new Date('2026-07-01T09:59:59Z') })).toBe(
      false,
    );
    expect(range.contains({ date: new Date('2026-07-01T12:00:01Z') })).toBe(
      false,
    );
  });

  it('detects overlaps but not adjacent or disjoint ranges', () => {
    const range = DateRange.create({ start, end });

    expect(
      range.overlaps({
        other: DateRange.create({
          start: new Date('2026-07-01T11:00:00Z'),
          end: new Date('2026-07-01T13:00:00Z'),
        }),
      }),
    ).toBe(true);
    expect(
      range.overlaps({
        other: DateRange.create({
          start: end,
          end: new Date('2026-07-01T13:00:00Z'),
        }),
      }),
    ).toBe(false);
    expect(
      range.overlaps({
        other: DateRange.create({
          start: new Date('2026-07-01T08:00:00Z'),
          end: new Date('2026-07-01T09:00:00Z'),
        }),
      }),
    ).toBe(false);
  });

  it('normalizes instant boundaries to church-local dates when requested', () => {
    const range = DateRange.createDateOnly({
      start: new Date('2026-07-02T02:59:00.000Z'),
      end: new Date('2026-07-02T03:01:00.000Z'),
      timeZone: 'America/Sao_Paulo',
    });

    expect(range.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });
});
