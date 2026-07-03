import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  getCurrentChurchDate,
  toChurchDate,
} from '../../src/test-support/clock';

describe('FixedClock', () => {
  it('returns a stable copy of the injected instant', () => {
    const instant = new Date('2026-03-01T00:30:00.000Z');
    const clock = new FixedClock({ instant });

    const first = clock.now();
    first.setUTCFullYear(2000);

    expect(clock.now()).toEqual(instant);
  });
});

describe('church date helpers', () => {
  it('resolves the previous month near midnight in church timezone', () => {
    expect(
      toChurchDate({
        instant: new Date('2026-03-01T00:30:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('2026-02-28');
  });

  it('uses the injected clock for the current church date', () => {
    const clock = new FixedClock({
      instant: new Date('2026-07-03T02:30:00.000Z'),
    });

    expect(getCurrentChurchDate({ clock, timeZone: 'America/Sao_Paulo' })).toBe(
      '2026-07-02',
    );
  });
});
