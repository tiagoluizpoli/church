import { afterEach, describe, expect, it } from 'vitest';
import {
  currentTimeOfDay,
  InvalidTimeValueError,
  isInstant,
  now,
  parseInstant,
  resetClock,
  setTestClock,
} from '../src';

describe('clock', () => {
  afterEach(() => {
    resetClock();
  });

  it('returns a canonical Instant from the real clock', () => {
    expect(isInstant({ value: now() })).toBe(true);
  });

  it('is fixed by setTestClock and released by resetClock', () => {
    const fixed = parseInstant({ value: '2027-01-04T13:30:00Z' });
    setTestClock({ instant: fixed });
    expect(now()).toBe(fixed);

    resetClock();
    expect(now()).not.toBe(fixed);
  });

  it('reads the current TimeOfDay in the Church Timezone', () => {
    setTestClock({ instant: parseInstant({ value: '2027-01-05T02:15:00Z' }) });
    expect(currentTimeOfDay({ timeZone: 'America/Sao_Paulo' })).toBe('23:15');
    expect(currentTimeOfDay({ timeZone: 'Asia/Kolkata' })).toBe('07:45');
  });

  it('rejects a Church Timezone that is not an IANA name', () => {
    expect(() => currentTimeOfDay({ timeZone: '-03:00' })).toThrow(
      new InvalidTimeValueError({ kind: 'TimeZone', value: '-03:00' }),
    );
  });
});
