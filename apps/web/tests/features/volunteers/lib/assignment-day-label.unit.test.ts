import { overwriteGetLocale } from '@church/i18n/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  relativeDayName,
  startsIn,
} from '@/features/volunteers/lib/assignment-day-label';

const timeZone = 'America/Sao_Paulo';

beforeEach(() => {
  overwriteGetLocale(() => 'pt-BR');
  vi.useFakeTimers({ toFake: ['Date'] });
  // 23:30 on Wednesday 18 Nov in São Paulo, already Thursday in UTC.
  vi.setSystemTime(new Date('2026-11-19T02:30:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  overwriteGetLocale(() => 'en');
});

describe('relativeDayName', () => {
  it.each([
    ['2026-11-18T22:30:00.000Z', 'Hoje'],
    ['2026-11-19T02:59:00.000Z', 'Hoje'],
    ['2026-11-19T12:00:00.000Z', 'Amanhã'],
    ['2026-11-20T12:00:00.000Z', null],
    ['2026-11-17T12:00:00.000Z', null],
  ])('reads %s on the Church day as %s', (startTime, expected) => {
    expect(relativeDayName({ startTime, timeZone })).toBe(expected);
  });
});

describe('startsIn', () => {
  it.each([
    ['2026-11-19T03:10:00.000Z', 'em 40 minutos'],
    ['2026-11-19T18:30:00.000Z', 'em 16 horas'],
    ['2026-11-21T02:29:00.000Z', 'em 47 horas'],
    // From 48 hours it counts Church days: 23:30 on Friday 20 is two days after Wednesday 18.
    ['2026-11-21T02:30:00.000Z', 'depois de amanhã'],
    ['2026-11-19T02:30:00.000Z', null],
    ['2026-11-18T22:30:00.000Z', null],
  ])('reads a start at %s as %s', (startTime, expected) => {
    expect(startsIn({ startTime, timeZone })).toBe(expected);
  });
});
