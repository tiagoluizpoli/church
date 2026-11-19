import { describe, expect, it } from 'vitest';
import {
  revealOffset,
  seedShiftCounts,
} from '@/features/scheduling/components/prepare/preparation-block.utils';

describe('revealOffset', () => {
  const view = { top: 64, bottom: 900 };
  it('leaves a block editor that is already wholly in view', () => {
    expect(revealOffset({ target: { top: 317, bottom: 800 }, view })).toBe(0);
  });
  it('scrolls only as far as the bottom needs while the top stays in view', () => {
    expect(revealOffset({ target: { top: 317, bottom: 1000 }, view })).toBe(
      100,
    );
  });
  it('brings the top to the view top when the editor is taller than the view', () => {
    expect(revealOffset({ target: { top: 317, bottom: 1500 }, view })).toBe(
      253,
    );
  });
  it('scrolls back up to an editor top above the view', () => {
    expect(revealOffset({ target: { top: -200, bottom: 600 }, view })).toBe(
      -264,
    );
  });
});

describe('seedShiftCounts', () => {
  const whole = { key: '22:00-02:00', label: 'Whole' };
  const first = { key: '2:0', label: 'Shift 1' };
  const second = { key: '2:1', label: 'Shift 2' };
  it('copies the Shift at the same position, or the last one, into Shifts with no counts', () => {
    expect(
      seedShiftCounts({
        values: {
          '22:00-02:00|stage|singer': '7',
          '22:00-02:00|door|usher': '1',
        },
        from: [whole],
        to: [first, second],
      }),
    ).toEqual({
      '22:00-02:00|stage|singer': '7',
      '22:00-02:00|door|usher': '1',
      '2:0|stage|singer': '7',
      '2:0|door|usher': '1',
      '2:1|stage|singer': '7',
      '2:1|door|usher': '1',
    });
  });
  it('keeps a Shift’s own counts when its split comes back', () => {
    expect(
      seedShiftCounts({
        values: { '22:00-02:00|stage|singer': '7', '2:1|stage|singer': '5' },
        from: [whole],
        to: [first, second],
      }),
    ).toEqual({
      '22:00-02:00|stage|singer': '7',
      '2:0|stage|singer': '7',
      '2:1|stage|singer': '5',
    });
  });
});
