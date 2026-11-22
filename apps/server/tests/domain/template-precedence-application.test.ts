import type { CalendarDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import type { EventId, EventTimeBlockId } from '@/domain/branded-ids';
import type { Recurrence } from '@/domain/recurrence';
import {
  type ExistingLoserEventTimeBlock,
  listLosingEventTimeBlocks,
  losingBlockIds,
  type PrecedenceTemplate,
} from '@/domain/services/template-precedence-application';

const sundays: Recurrence = { kind: 'weekly', weekdays: [0] };
const firstSunday: Recurrence = {
  kind: 'monthly',
  entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
};
// 2026-11-01 is the 1st Sunday of November, 2026-11-08 the 2nd.
const firstSundayDay = '2026-11-01' as CalendarDay;
const secondSundayDay = '2026-11-08' as CalendarDay;

function template(
  id: string,
  recurrence: Recurrence,
  ...blocks: [string, string, string][]
): PrecedenceTemplate {
  return {
    id,
    name: id,
    recurrence,
    blocks: blocks.map(([blockId, startTime, endTime]) => ({
      id: blockId,
      startTime,
      endTime,
    })),
  };
}

describe('losingBlockIds', () => {
  const winner = template('monthly', firstSunday, ['w1', '10:00', '11:00']);
  const loser = template(
    'weekly',
    sundays,
    ['early', '08:00', '09:00'],
    ['overlap', '10:30', '12:00'],
  );
  const pairs = [{ winner, loser }];

  it('drops only the loser blocks that overlap a winner block on a winner day', () => {
    expect(losingBlockIds({ day: firstSundayDay, loser, pairs })).toEqual(
      new Set(['overlap']),
    );
  });

  it('keeps every block on days the winner Recurrence does not name', () => {
    expect(losingBlockIds({ day: secondSundayDay, loser, pairs })).toEqual(
      new Set(),
    );
  });

  it('drops every block when each one overlaps the winner', () => {
    const swallowed = template('weekly', sundays, ['a', '10:15', '10:45']);
    expect(
      losingBlockIds({
        day: firstSundayDay,
        loser: swallowed,
        pairs: [{ winner, loser: swallowed }],
      }),
    ).toEqual(new Set(['a']));
  });

  it('is not transitive: a winner that loses elsewhere still wins its own pair', () => {
    const top = template('top', firstSunday, ['t1', '10:00', '12:00']);
    const middle = template('middle', sundays, ['m1', '10:00', '11:00']);
    const bottom = template('bottom', sundays, ['b1', '10:30', '11:30']);
    const chain = [
      { winner: top, loser: middle },
      { winner: middle, loser: bottom },
    ];
    expect(
      losingBlockIds({ day: firstSundayDay, loser: middle, pairs: chain }),
    ).toEqual(new Set(['m1']));
    expect(
      losingBlockIds({ day: firstSundayDay, loser: bottom, pairs: chain }),
    ).toEqual(new Set(['b1']));
    // On the 2nd Sunday `top` is silent, but `middle` still beats `bottom`.
    expect(
      losingBlockIds({ day: secondSundayDay, loser: bottom, pairs: chain }),
    ).toEqual(new Set(['b1']));
  });
});

describe('listLosingEventTimeBlocks', () => {
  const winner = template('monthly', firstSunday, ['w1', '10:00', '11:00']);
  const loser = template(
    'weekly',
    sundays,
    ['early', '08:00', '09:00'],
    ['overlap', '10:30', '12:00'],
  );

  function existing(
    eventDate: CalendarDay,
    sourceTemplateTimeBlockId: string,
    id: string,
    startTime: string,
  ): ExistingLoserEventTimeBlock {
    return {
      eventId: `event-${eventDate}` as EventId,
      eventTitle: 'Sunday',
      eventDate,
      eventTimeBlockId: id as EventTimeBlockId,
      startTime,
      endTime: startTime,
      sourceTemplateTimeBlockId,
    };
  }

  it('lists existing loser blocks that overlap on winner days only, ordered by start then id', () => {
    const listed = listLosingEventTimeBlocks({
      pairs: [{ winner, loser }],
      cycleStart: '2026-11-01' as CalendarDay,
      cycleEnd: '2026-11-30' as CalendarDay,
      existing: [
        existing(
          secondSundayDay,
          'overlap',
          'later-sunday',
          '2026-11-08T10:30Z',
        ),
        existing(firstSundayDay, 'early', 'no-overlap', '2026-11-01T08:00Z'),
        existing(firstSundayDay, 'overlap', 'b', '2026-11-01T10:30Z'),
        existing(firstSundayDay, 'overlap', 'a', '2026-11-01T10:30Z'),
      ],
    });
    expect(
      listed.map(({ eventTimeBlockId, winnerTemplateName }) => [
        eventTimeBlockId,
        winnerTemplateName,
      ]),
    ).toEqual([
      ['a', 'monthly'],
      ['b', 'monthly'],
    ]);
  });
});
