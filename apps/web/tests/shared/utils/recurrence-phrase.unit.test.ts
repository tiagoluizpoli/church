import { describe, expect, it } from 'vitest';
import type { UpdateEventTemplateBodyRecurrence as Recurrence } from '@/infrastructure/api/churchAPI.schemas';
import { describeRecurrence } from '@/shared/utils/recurrence-phrase';

function words(recurrence: Recurrence) {
  return describeRecurrence({ recurrence, locale: 'pt-BR' });
}

describe('describeRecurrence in pt-BR', () => {
  it('words one weekly weekday with its gender', () => {
    expect(words({ kind: 'weekly', weekdays: [0] })).toBe('Todo domingo');
    expect(words({ kind: 'weekly', weekdays: [6] })).toBe('Todo sábado');
    expect(words({ kind: 'weekly', weekdays: [3] })).toBe('Toda quarta-feira');
  });

  it('words several weekly weekdays in week order', () => {
    expect(words({ kind: 'weekly', weekdays: [5, 0, 3, 0] })).toBe(
      'Semanal: domingo, quarta-feira e sexta-feira',
    );
  });

  it('words nth weekdays, grouping ordinals of one weekday', () => {
    expect(
      words({
        kind: 'monthly',
        entries: [
          { kind: 'nthWeekday', ordinal: 3, weekday: 0 },
          { kind: 'nthWeekday', ordinal: 1, weekday: 0 },
        ],
      }),
    ).toBe('1º e 3º domingo do mês');
    expect(
      words({
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
      }),
    ).toBe('Último sábado do mês');
    expect(
      words({
        kind: 'monthly',
        entries: [
          { kind: 'nthWeekday', ordinal: 'last', weekday: 2 },
          { kind: 'nthWeekday', ordinal: 2, weekday: 2 },
        ],
      }),
    ).toBe('2ª e última terça-feira do mês');
  });

  it('words a day of the month and the last day', () => {
    expect(
      words({ kind: 'monthly', entries: [{ kind: 'dayOfMonth', day: 15 }] }),
    ).toBe('Dia 15 de cada mês');
    expect(
      words({ kind: 'monthly', entries: [{ kind: 'lastDayOfMonth' }] }),
    ).toBe('Último dia do mês');
  });

  it('words mixed entries: weekdays by day, then days of the month, then the last day', () => {
    expect(
      words({
        kind: 'monthly',
        entries: [
          { kind: 'lastDayOfMonth' },
          { kind: 'dayOfMonth', day: 20 },
          { kind: 'dayOfMonth', day: 5 },
          { kind: 'dayOfMonth', day: 5 },
          { kind: 'nthWeekday', ordinal: 2, weekday: 6 },
          { kind: 'nthWeekday', ordinal: 1, weekday: 0 },
        ],
      }),
    ).toBe(
      '1º domingo do mês; 2º sábado do mês; dia 5 de cada mês; dia 20 de cada mês; último dia do mês',
    );
  });

  it('words in English too', () => {
    expect(
      describeRecurrence({
        recurrence: { kind: 'weekly', weekdays: [0] },
        locale: 'en',
      }),
    ).toBe('Every Sunday');
  });
});
