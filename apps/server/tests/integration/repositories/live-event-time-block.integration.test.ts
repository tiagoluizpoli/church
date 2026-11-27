import { event, eventTimeBlock } from '@church/db';
import { parseCalendarDay, parseInstant } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { shownEventTimeBlock } from '@/infrastructure/repositories/live-event-time-block';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
} from '@/seeds/builders/scheduling';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const db = schedulingTestDb;
const start = parseInstant({ value: '2026-10-18T13:00:00Z' });
const end = parseInstant({ value: '2026-10-18T15:00:00Z' });

beforeEach(async () => {
  await resetSchedulingPhase3Db();
});

describe('shownEventTimeBlock', () => {
  it('keeps only blocks hidden neither themselves nor through their Event', async () => {
    const { churchAId: churchId } = await seedSchedulingPhase3Base();
    const cycle = await buildCycle({
      db,
      churchId,
      name: 'October',
      state: 'sent',
      startDate: parseCalendarDay({ value: '2026-10-12' }),
      endDate: parseCalendarDay({ value: '2026-10-25' }),
    });
    for (const eventHidden of [false, true]) {
      const owner = await buildEvent({
        db,
        churchId,
        cycleId: cycle.id,
        title: `event ${eventHidden}`,
        start,
        end,
        status: 'cancelled',
      });
      await db
        .update(event)
        .set({ isHidden: eventHidden })
        .where(eq(event.id, owner.id));
      for (const blockHidden of [false, true]) {
        const block = await buildEventTimeBlock({
          db,
          churchId,
          eventId: owner.id,
          label: `event ${eventHidden}, block ${blockHidden}`,
          start,
          end,
        });
        await db
          .update(eventTimeBlock)
          .set({ isHidden: blockHidden })
          .where(eq(eventTimeBlock.id, block.id));
      }
    }

    const shown = await db
      .select({ label: eventTimeBlock.label })
      .from(eventTimeBlock)
      .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
      .where(shownEventTimeBlock());

    expect(shown).toEqual([{ label: 'event false, block false' }]);
  });
});
