import { describe, expect, it } from 'vitest';
import {
  type CalendarDay,
  formatCalendarDay,
  formatCalendarDayWithWeekday,
  formatDayAndMonth,
  formatDayLabel,
  formatInstant,
  formatInstantPrecise,
  formatRecency,
  formatRelative,
  formatTimeOfDay,
  formatWeekday,
  formatWeekdayOfIndex,
  formatWeekdayPluralOfIndex,
  formatWeekdayShort,
  type Instant,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  setTestClock,
  type TimeOfDay,
} from '../src';

function day(value: string): CalendarDay {
  return parseCalendarDay({ value });
}

function instant(value: string): Instant {
  return parseInstant({ value });
}

function timeOfDay(value: string): TimeOfDay {
  return parseTimeOfDay({ value });
}

describe('formatCalendarDay', () => {
  it('renders dd/MM/yyyy', () => {
    expect(formatCalendarDay({ day: day('2027-01-04') })).toBe('04/01/2027');
  });
});

describe('formatCalendarDayWithWeekday', () => {
  it('prefixes the weekday name in en', () => {
    expect(
      formatCalendarDayWithWeekday({ day: day('2027-01-04'), locale: 'en' }),
    ).toBe('Monday, 04/01/2027');
  });

  it('prefixes the weekday name in pt-BR', () => {
    expect(
      formatCalendarDayWithWeekday({ day: day('2027-01-04'), locale: 'pt-BR' }),
    ).toBe('Segunda-feira, 04/01/2027');
  });
});

describe('formatWeekday', () => {
  it.each([
    ['2027-01-03', 'Sunday'],
    ['2027-01-04', 'Monday'],
    ['2027-01-09', 'Saturday'],
  ])('names the weekday for %s in en', (value, expected) => {
    expect(formatWeekday({ day: day(value), locale: 'en' })).toBe(expected);
  });

  it.each([
    ['2027-01-03', 'Domingo'],
    ['2027-01-04', 'Segunda-feira'],
    ['2027-01-05', 'Terça-feira'],
    ['2027-01-06', 'Quarta-feira'],
    ['2027-01-07', 'Quinta-feira'],
    ['2027-01-08', 'Sexta-feira'],
    ['2027-01-09', 'Sábado'],
  ])('names the weekday for %s in pt-BR', (value, expected) => {
    expect(formatWeekday({ day: day(value), locale: 'pt-BR' })).toBe(expected);
  });

  it('capitalizes the first letter in pt-BR', () => {
    expect(formatWeekday({ day: day('2027-01-04'), locale: 'pt-BR' })).toMatch(
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/,
    );
  });
});

describe('formatWeekdayShort', () => {
  it.each([
    ['2027-01-03', 'Sun'],
    ['2027-01-04', 'Mon'],
    ['2027-01-09', 'Sat'],
  ])('gives short weekday for %s in en', (value, expected) => {
    expect(formatWeekdayShort({ day: day(value), locale: 'en' })).toBe(
      expected,
    );
  });

  it.each([
    ['2027-01-03', 'Dom.'],
    ['2027-01-04', 'Seg.'],
    ['2027-01-05', 'Ter.'],
    ['2027-01-06', 'Qua.'],
    ['2027-01-07', 'Qui.'],
    ['2027-01-08', 'Sex.'],
    ['2027-01-09', 'Sáb.'],
  ])('gives short weekday for %s in pt-BR', (value, expected) => {
    expect(formatWeekdayShort({ day: day(value), locale: 'pt-BR' })).toBe(
      expected,
    );
  });

  it('capitalizes the first letter in pt-BR', () => {
    expect(
      formatWeekdayShort({ day: day('2027-01-04'), locale: 'pt-BR' }),
    ).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/);
  });
});

describe('formatWeekdayOfIndex', () => {
  it.each([
    [0, 'Sunday'],
    [1, 'Monday'],
    [6, 'Saturday'],
  ] as const)('returns long name for index %d in en', (index, expected) => {
    expect(formatWeekdayOfIndex({ index, locale: 'en' })).toBe(expected);
  });

  it.each([
    [0, 'Domingo'],
    [1, 'Segunda-feira'],
    [2, 'Terça-feira'],
    [3, 'Quarta-feira'],
    [4, 'Quinta-feira'],
    [5, 'Sexta-feira'],
    [6, 'Sábado'],
  ] as const)('returns long name for index %d in pt-BR', (index, expected) => {
    expect(formatWeekdayOfIndex({ index, locale: 'pt-BR' })).toBe(expected);
  });
});

describe('formatWeekdayPluralOfIndex', () => {
  const EN_PLURALS = [
    'Sundays',
    'Mondays',
    'Tuesdays',
    'Wednesdays',
    'Thursdays',
    'Fridays',
    'Saturdays',
  ] as const;

  const PTBR_PLURALS = [
    'Domingos',
    'Segundas-feiras',
    'Terças-feiras',
    'Quartas-feiras',
    'Quintas-feiras',
    'Sextas-feiras',
    'Sábados',
  ] as const;

  it('returns all 7 plural weekdays in en', () => {
    for (let i = 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6; i <= 6; i++) {
      expect(formatWeekdayPluralOfIndex({ index: i, locale: 'en' })).toBe(
        EN_PLURALS[i],
      );
    }
  });

  it('returns all 7 plural weekdays in pt-BR', () => {
    for (let i = 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6; i <= 6; i++) {
      expect(formatWeekdayPluralOfIndex({ index: i, locale: 'pt-BR' })).toBe(
        PTBR_PLURALS[i],
      );
    }
  });
});

describe('formatDayAndMonth', () => {
  it('renders dd/MM without the year', () => {
    expect(formatDayAndMonth({ day: day('2027-01-04') })).toBe('04/01');
  });
});

describe('formatTimeOfDay', () => {
  it('renders HH:mm with no AM/PM', () => {
    expect(formatTimeOfDay({ time: timeOfDay('14:30') })).toBe('14:30');
    expect(formatTimeOfDay({ time: timeOfDay('00:00') })).not.toMatch(/AM|PM/);
  });
});

describe('formatInstant', () => {
  it('reads the Church Timezone wall clock (non-UTC zone)', () => {
    expect(
      formatInstant({
        instant: instant('2027-01-04T13:30:00.000Z'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 10:30');
  });

  it('reads the Church Timezone wall clock across a DST transition', () => {
    // 2027-03-14T07:00Z is the transition instant: EST (-5) before, EDT (-4) from.
    expect(
      formatInstant({
        instant: instant('2027-03-14T06:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 01:00');
    expect(
      formatInstant({
        instant: instant('2027-03-14T08:00:00.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 04:00');
  });

  it('never shows AM/PM', () => {
    expect(
      formatInstant({
        instant: instant('2027-01-04T13:30:00.000Z'),
        timeZone: 'UTC',
      }),
    ).not.toMatch(/AM|PM/);
  });
});

describe('formatInstantPrecise', () => {
  it('adds seconds', () => {
    expect(
      formatInstantPrecise({
        instant: instant('2027-01-04T13:30:05.123Z'),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('04/01/2027 10:30:05');
  });

  it('shows seconds across a DST transition', () => {
    // 2027-03-14T07:00Z is the transition instant: EST (-5) before, EDT (-4) from.
    expect(
      formatInstantPrecise({
        instant: instant('2027-03-14T06:00:09.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 01:00:09');
    expect(
      formatInstantPrecise({
        instant: instant('2027-03-14T08:00:09.000Z'),
        timeZone: 'America/New_York',
      }),
    ).toBe('14/03/2027 04:00:09');
  });

  it('never shows milliseconds', () => {
    expect(
      formatInstantPrecise({
        instant: instant('2027-01-04T13:30:05.999Z'),
        timeZone: 'UTC',
      }),
    ).not.toContain('.');
  });
});

describe('formatRelative', () => {
  it('names today, tomorrow and yesterday in en', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-04T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('today');
    expect(
      formatRelative({
        instant: instant('2027-01-05T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('tomorrow');
    expect(
      formatRelative({
        instant: instant('2027-01-03T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('yesterday');
  });

  it('names hoje, amanhã and ontem in pt-BR', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-04T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('hoje');
    expect(
      formatRelative({
        instant: instant('2027-01-05T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('amanhã');
    expect(
      formatRelative({
        instant: instant('2027-01-03T20:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('ontem');
  });

  it('counts days beyond the adjacent day in en', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-07T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('in 3 days');
    expect(
      formatRelative({
        instant: instant('2027-01-01T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('3 days ago');
  });

  it('counts days beyond the adjacent day in pt-BR', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    expect(
      formatRelative({
        instant: instant('2027-01-07T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('em 3 dias');
    expect(
      formatRelative({
        instant: instant('2027-01-01T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('há 3 dias');
  });

  it('resolves the CalendarDay through a non-UTC, DST-observing zone', () => {
    // now(): 2027-03-14T04:30Z is 2027-03-13 23:30 EST in New York.
    setTestClock({ instant: instant('2027-03-14T04:30:00.000Z') });
    // Target: 2027-03-14T17:00Z is 2027-03-14 13:00 EDT — one calendar day later.
    expect(
      formatRelative({
        instant: instant('2027-03-14T17:00:00.000Z'),
        timeZone: 'America/New_York',
        locale: 'en',
      }),
    ).toBe('tomorrow');
  });

  it('relative phrases never start with a capital letter', () => {
    setTestClock({ instant: instant('2027-01-04T12:00:00.000Z') });
    const phrase = formatRelative({
      instant: instant('2027-01-07T12:00:00.000Z'),
      timeZone: 'UTC',
      locale: 'pt-BR',
    });
    expect(phrase.charAt(0)).toBe(phrase.charAt(0).toLowerCase());
  });
});

describe('formatRecency', () => {
  it('is relative under 7 days in en', () => {
    setTestClock({ instant: instant('2027-01-10T12:00:00.000Z') });
    expect(
      formatRecency({
        instant: instant('2027-01-04T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('6 days ago');
    expect(
      formatRecency({
        instant: instant('2027-01-16T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('in 6 days');
  });

  it('is relative under 7 days in pt-BR', () => {
    setTestClock({ instant: instant('2027-01-10T12:00:00.000Z') });
    expect(
      formatRecency({
        instant: instant('2027-01-07T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('há 3 dias');
    expect(
      formatRecency({
        instant: instant('2027-01-13T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'pt-BR',
      }),
    ).toBe('em 3 dias');
  });

  it('switches to the absolute CalendarDay at exactly 7 days, past and future', () => {
    setTestClock({ instant: instant('2027-01-10T12:00:00.000Z') });
    expect(
      formatRecency({
        instant: instant('2027-01-03T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('03/01/2027');
    expect(
      formatRecency({
        instant: instant('2027-01-17T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en',
      }),
    ).toBe('17/01/2027');
  });

  it('resolves the CalendarDay distance through a non-UTC, DST-observing zone', () => {
    // now(): 2027-03-14T04:30Z is 2027-03-13 23:30 EST in New York.
    setTestClock({ instant: instant('2027-03-14T04:30:00.000Z') });
    // 2027-03-21T13:00Z is 2027-03-21 09:00 EDT — 8 CalendarDays later, past
    // the 7-day switch, so the absolute CalendarDay is shown.
    expect(
      formatRecency({
        instant: instant('2027-03-21T13:00:00.000Z'),
        timeZone: 'America/New_York',
        locale: 'en',
      }),
    ).toBe('21/03/2027');
    // 2027-03-16T13:00Z is 2027-03-16 09:00 EDT — 3 CalendarDays later, still
    // under the switch, so it stays relative.
    expect(
      formatRecency({
        instant: instant('2027-03-16T13:00:00.000Z'),
        timeZone: 'America/New_York',
        locale: 'en',
      }),
    ).toBe('in 3 days');
  });
});

describe('formatDayLabel', () => {
  it('reads like `dom 12 out` in pt-BR', () => {
    expect(formatDayLabel({ day: day('2026-10-12'), locale: 'pt-BR' })).toBe(
      'seg 12 out',
    );
    expect(formatDayLabel({ day: day('2026-10-11'), locale: 'pt-BR' })).toBe(
      'dom 11 out',
    );
  });

  it('reads like `Sun 11 Oct` in en, without padding the day', () => {
    expect(formatDayLabel({ day: day('2026-10-04'), locale: 'en' })).toBe(
      'Sun 4 Oct',
    );
  });
});
