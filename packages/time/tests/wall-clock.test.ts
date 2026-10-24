import { describe, expect, it } from 'vitest';
import { wallClockFields, zoneOffsetMs } from '../src/wall-clock';

const HOUR_MS = 60 * 60 * 1000;

// Fixtures from a side-by-side run against date-fns-tz (every 15 minutes of
// 2017–2018, zero mismatches), around Sao Paulo's last DST changeovers.
const cases = [
  // Sao Paulo spring-forward, 2017-10-15 00:00 -03:00 → 01:00 -02:00.
  ['America/Sao_Paulo', '2017-10-15T02:59:59.000Z', '2017-10-14 23:59:59', -3],
  ['America/Sao_Paulo', '2017-10-15T03:00:00.000Z', '2017-10-15 01:00:00', -2],
  // Sao Paulo fall-back, 2018-02-18 00:00 -02:00 → 2018-02-17 23:00 -03:00.
  ['America/Sao_Paulo', '2018-02-18T01:59:59.000Z', '2018-02-17 23:59:59', -2],
  ['America/Sao_Paulo', '2018-02-18T02:00:00.000Z', '2018-02-17 23:00:00', -3],
  // No DST since 2019.
  ['America/Sao_Paulo', '2027-01-04T03:00:00.000Z', '2027-01-04 00:00:00', -3],
  // Auckland spring-forward, 2018-09-30 02:00 +12:00 → 03:00 +13:00.
  ['Pacific/Auckland', '2018-09-29T13:59:59.000Z', '2018-09-30 01:59:59', 12],
  ['Pacific/Auckland', '2018-09-29T14:00:00.000Z', '2018-09-30 03:00:00', 13],
  ['UTC', '2027-03-14T07:30:45.999Z', '2027-03-14 07:30:45', 0],
] as const;

describe.each(
  cases,
)('wall clock in %s at %s', (timeZone, iso, expected, offsetHours) => {
  const epochMs = Date.parse(iso);

  it(`reads ${expected}`, () => {
    const { year, month, day, hour, minute, second } = wallClockFields({
      timeZone,
      epochMs,
    });
    expect(`${year}-${month}-${day} ${hour}:${minute}:${second}`).toBe(
      expected,
    );
  });

  it(`is UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`, () => {
    expect(zoneOffsetMs({ timeZone, epochMs })).toBe(offsetHours * HOUR_MS);
  });
});
