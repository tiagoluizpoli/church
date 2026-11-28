import { describe, expect, it } from 'vitest';
import {
  type ExportPartWeek,
  exportDayRange,
  exportPartName,
  exportTimeParts,
} from '@/schedule-export-wording';

const wording = {
  week: ({ from, to }: ExportPartWeek) => `Semana ${from}/${to}`,
  catchAll: () => 'Outros',
};

describe('exportPartName', () => {
  it('names no part of an unsplit export', () => {
    expect(
      exportPartName({
        part: { kind: 'all', name: null, week: null },
        wording,
      }),
    ).toBeNull();
  });

  it('words a week, the unnamed catch-all, and keeps other names as written', () => {
    const week = { from: '2027-03-01', to: '2027-03-07' };
    const name = (
      kind: string,
      value: string | null,
      span: ExportPartWeek | null = null,
    ) => exportPartName({ part: { kind, name: value, week: span }, wording });

    expect(name('week', null, week)).toBe('Semana 2027-03-01/2027-03-07');
    expect(name('catchAll', null)).toBe('Outros');
    expect(name('catchAll', 'Avulsos')).toBe('Avulsos');
    expect(name('sector', 'Berçário')).toBe('Berçário');
  });
});

describe('exportTimeParts', () => {
  it('splits an HH:mm time', () => {
    expect(exportTimeParts({ time: '08:05' })).toEqual({
      hours: '08',
      minutes: '05',
    });
  });
});

describe('exportDayRange', () => {
  it('words two days as dd/mm/yyyy – dd/mm/yyyy', () => {
    expect(exportDayRange({ from: '2026-12-01', to: '2026-12-31' })).toBe(
      '01/12/2026 – 31/12/2026',
    );
  });
});
