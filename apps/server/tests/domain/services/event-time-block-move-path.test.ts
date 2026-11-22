import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { eventTimeBlockMovePath } from '@/domain/services/event-time-block-move-path';

const at = (hour: number) =>
  parseInstant({
    value: `2026-10-18T${String(hour).padStart(2, '0')}:00:00.000Z`,
  });
const move = (from: number, to: number) => ({
  previousStart: at(from),
  previousEnd: at(from + 1),
  newStart: at(to),
  newEnd: at(to + 1),
});

describe('eventTimeBlockMovePath', () => {
  it('shows no mark and the current time as as-sent when there are no moves', () => {
    expect(
      eventTimeBlockMovePath({
        currentStart: at(9),
        currentEnd: at(10),
        moves: [],
      }),
    ).toEqual({ moved: false, steps: [{ start: at(9), end: at(10) }] });
  });

  it('starts at the first previous value and ends at the last new value', () => {
    expect(
      eventTimeBlockMovePath({
        currentStart: at(11),
        currentEnd: at(12),
        moves: [move(9, 11)],
      }),
    ).toEqual({
      moved: true,
      steps: [
        { start: at(9), end: at(10) },
        { start: at(11), end: at(12) },
      ],
    });
  });

  it('lists every recorded time in order for several moves', () => {
    expect(
      eventTimeBlockMovePath({
        currentStart: at(14),
        currentEnd: at(15),
        moves: [move(9, 11), move(11, 14)],
      }).steps,
    ).toEqual([
      { start: at(9), end: at(10) },
      { start: at(11), end: at(12) },
      { start: at(14), end: at(15) },
    ]);
  });

  it('shows no mark when moved back to the as-sent time', () => {
    const path = eventTimeBlockMovePath({
      currentStart: at(9),
      currentEnd: at(10),
      moves: [move(9, 11), move(11, 9)],
    });
    expect(path.moved).toBe(false);
  });
});
