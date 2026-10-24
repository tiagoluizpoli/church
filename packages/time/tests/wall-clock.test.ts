import { formatInTimeZone } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { wallClockFields, zoneOffsetMs } from '../src/wall-clock';

const QUARTER_HOUR_MS = 15 * 60 * 1000;

function formatOffset(offsetMs: number): string {
  const minutes = Math.abs(offsetMs) / 60_000;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${offsetMs < 0 ? '-' : '+'}${hh}:${mm}`;
}

// Side by side with date-fns-tz across 2017–2018: Sao Paulo still observed DST.
describe.each([
  'America/Sao_Paulo',
  'UTC',
  'Pacific/Auckland',
])('wall clock in %s matches date-fns-tz', (timeZone) => {
  it('agrees every 15 minutes across 2017 and 2018', () => {
    const start = Date.UTC(2017, 0, 1);
    const end = Date.UTC(2019, 0, 1);
    const mismatches: string[] = [];
    const dateFnsTzWrong: string[] = [];
    let compared = 0;
    for (let epochMs = start; epochMs < end; epochMs += QUARTER_HOUR_MS) {
      const date = new Date(epochMs);
      const { year, month, day, hour, minute, second } = wallClockFields({
        timeZone,
        epochMs,
      });
      const actual = [
        formatOffset(zoneOffsetMs({ timeZone, epochMs })),
        `${year}-${month}-${day}`,
        `${hour}:${minute}`,
        `${hour}:${minute}:${second}`,
      ].join(' ');
      const expected = ['xxx', 'yyyy-MM-dd', 'HH:mm', 'HH:mm:ss']
        .map((pattern) => formatInTimeZone(date, timeZone, pattern))
        .join(' ');
      compared += 1;
      if (actual === expected) continue;
      const line = `${date.toISOString()}: ${actual} != ${expected}`;
      // date-fns-tz misreads moments in the process TZ's own DST gap; the
      // offsets still agree, and moment + offset is the true wall clock.
      const [offset, ...wallClock] = actual.split(' ');
      const truth = new Date(epochMs + zoneOffsetMs({ timeZone, epochMs }))
        .toISOString()
        .slice(0, 19);
      const [isoDay = '', isoTime = ''] = truth.split('T');
      const explained =
        offset === expected.split(' ')[0] &&
        wallClock.join(' ') === `${isoDay} ${isoTime.slice(0, 5)} ${isoTime}`;
      (explained ? dateFnsTzWrong : mismatches).push(line);
    }
    console.info(
      `${timeZone}: ${compared} moments, ${mismatches.length} mismatches, ${dateFnsTzWrong.length} date-fns-tz process-TZ errors`,
      dateFnsTzWrong,
    );
    expect(compared).toBe(70_080);
    expect(mismatches.slice(0, 10)).toEqual([]);
  }, 60_000);
});
