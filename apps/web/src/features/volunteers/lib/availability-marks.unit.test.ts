import { parseCalendarDay, parseTimeOfDay, toInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  createInitialMarkDraft,
  getShiftDate,
  toggleShiftMark,
  toggleWholeDayMark,
} from './availability-marks';
import type { GetAvailabilityCheck200ShiftsItem } from '@/infrastructure/api/churchAPI.schemas';

const SAO_PAULO = 'America/Sao_Paulo'; // west of UTC
const KOLKATA = 'Asia/Kolkata'; // east of UTC

function shift(
  shiftId: string,
  startTime: string,
  endTime: string,
): GetAvailabilityCheck200ShiftsItem {
  return {
    shiftId,
    eventTitle: 'Sunday',
    startTime,
    endTime,
    available: true,
  } as GetAvailabilityCheck200ShiftsItem;
}

// Both on 4 Jan in São Paulo; the evening one is already 5 Jan in UTC.
const MORNING = shift(
  'morning',
  '2027-01-04T12:00:00.000Z',
  '2027-01-04T14:00:00.000Z',
);
const EVENING = shift(
  'evening',
  '2027-01-05T01:30:00.000Z',
  '2027-01-05T02:30:00.000Z',
);
const SHIFTS = [MORNING, EVENING];

describe('availability marks', () => {
  it('dates a shift by its Church-Timezone day', () => {
    expect(getShiftDate({ shift: EVENING, timeZone: SAO_PAULO })).toBe(
      '2027-01-04',
    );
    expect(getShiftDate({ shift: EVENING, timeZone: 'UTC' })).toBe(
      '2027-01-05',
    );
  });

  it('marks every shift on the church day when the whole day is toggled', () => {
    const draft = toggleWholeDayMark({
      draft: createInitialMarkDraft({ shifts: SHIFTS, timeZone: SAO_PAULO }),
      shifts: SHIFTS,
      date: parseCalendarDay({ value: '2027-01-04' }),
      timeZone: SAO_PAULO,
    });

    expect([...draft.markedShiftIds].sort()).toEqual(['evening', 'morning']);
    expect([...draft.wholeDayDates]).toEqual(['2027-01-04']);
  });

  it('derives the whole-day mark once every shift on that church day is marked', () => {
    let draft = createInitialMarkDraft({ shifts: SHIFTS, timeZone: SAO_PAULO });
    draft = toggleShiftMark({
      draft,
      shifts: SHIFTS,
      shiftId: 'morning',
      timeZone: SAO_PAULO,
    });
    expect(draft.wholeDayDates.size).toBe(0);

    draft = toggleShiftMark({
      draft,
      shifts: SHIFTS,
      shiftId: 'evening',
      timeZone: SAO_PAULO,
    });
    expect([...draft.wholeDayDates]).toEqual(['2027-01-04']);
  });

  it.each([
    { label: 'west of UTC', timeZone: SAO_PAULO },
    { label: 'east of UTC', timeZone: KOLKATA },
  ])('whole-day $label includes a 23:00 church-local Shift and excludes a 00:30 next-day Shift', ({
    timeZone,
  }) => {
    const day = parseCalendarDay({ value: '2027-01-04' });
    const nextDay = parseCalendarDay({ value: '2027-01-05' });
    const lateNight = shift(
      'late-night',
      toInstant({
        day,
        time: parseTimeOfDay({ value: '23:00' }),
        timeZone,
      }),
      toInstant({
        day,
        time: parseTimeOfDay({ value: '23:45' }),
        timeZone,
      }),
    );
    const pastMidnight = shift(
      'past-midnight',
      toInstant({
        day: nextDay,
        time: parseTimeOfDay({ value: '00:30' }),
        timeZone,
      }),
      toInstant({
        day: nextDay,
        time: parseTimeOfDay({ value: '01:15' }),
        timeZone,
      }),
    );
    const shifts = [lateNight, pastMidnight];

    const draft = toggleWholeDayMark({
      draft: createInitialMarkDraft({ shifts, timeZone }),
      shifts,
      date: day,
      timeZone,
    });

    expect([...draft.markedShiftIds]).toEqual(['late-night']);
  });
});
