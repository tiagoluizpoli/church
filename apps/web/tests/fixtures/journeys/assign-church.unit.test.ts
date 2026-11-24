import { describe, expect, it } from 'vitest';
import { dayFilterName } from './assign-church';
import { dateLabel } from '@/features/scheduling/utils/builder/cycle-builder-date.utils';

interface ChipLabelInput {
  day: string;
}

/** The accessible name the cycle builder's date strip gives a day's chip. */
function chipLabel({ day }: ChipLabelInput): string {
  return `${dateLabel({ day, locale: 'pt-BR' })}, 40% preenchido, 1 evento`;
}

describe('dayFilterName', () => {
  it("matches the builder's own label for a day past the year boundary", () => {
    expect(
      dayFilterName({ day: '2027-01-04' }).test(
        chipLabel({ day: '2027-01-04' }),
      ),
    ).toBe(true);
  });

  it('rejects nearby days sharing its day of month or its month', () => {
    const name = dayFilterName({ day: '2027-01-04' });

    for (const day of [
      '2027-01-14',
      '2027-04-01',
      '2026-12-04',
      '2027-02-04',
    ]) {
      expect(name.test(chipLabel({ day }))).toBe(false);
    }
  });
});
