import { event, eventTimeBlock } from '@church/db';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
import { ChurchId, EventId } from '@/domain/branded-ids';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { buildEventTimeBlock } from '@/seeds/builders/scheduling';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

function createManagers() {
  const cycleRepository = new DrizzleCycleRepository({
    db: schedulingTestDb,
  });
  const eventRepository = new DrizzlePlanningEventRepository({
    db: schedulingTestDb,
  });
  const templateRepository = new DrizzleEventTemplateRepository({
    db: schedulingTestDb,
  });
  const churchRepository = new DrizzleChurchRepository({
    db: schedulingTestDb,
  });
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db: schedulingTestDb,
  });
  const shiftRepository = new DrizzleShiftRepository({ db: schedulingTestDb });
  const usualSetupRepository = new DrizzleUsualSetupRepository({
    db: schedulingTestDb,
  });
  const ministryRepository = new DrizzleMinistryRepository({
    db: schedulingTestDb,
  });
  const eventTimeBlockRepository = new DrizzleEventTimeBlockRepository({
    db: schedulingTestDb,
  });

  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });

  return {
    cycleManager: new DbCycleManager({
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      staffingSeeder,
    }),
    eventManager: new DbPlanningEventManager({
      cycleRepository,
      eventRepository,
      templateRepository,
      churchRepository,
      unitOfWork,
      eventTimeBlockRepository,
    }),
    templateManager: new DbEventTemplateManager({
      templateRepository,
      unitOfWork,
    }),
    eventTimeBlockRepository,
  };
}

interface SeedEventTimeBlockInput {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

async function seedEventTimeBlock(input: SeedEventTimeBlockInput) {
  return await buildEventTimeBlock({
    db: schedulingTestDb,
    churchId: input.churchId,
    eventId: input.eventId,
    start: fromDate({ date: input.startTime }),
    end: fromDate({ date: input.endTime }),
    label: input.label,
  });
}

describe('Planning transaction guarantees', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('allows exactly one concurrent overlapping cycle create to succeed', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const results = await Promise.allSettled([
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Concurrent A',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Concurrent B',
        startDate: new Date('2026-11-15T00:00:00.000Z'),
        endDate: new Date('2026-12-15T00:00:00.000Z'),
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('updateEvent cascades a startDate change onto every child event time block atomically, and leaves event time blocks alone for non-date edits', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, eventTimeBlockRepository } =
      createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Cascade cycle',
      startDate: new Date('2027-06-01T00:00:00.000Z'),
      endDate: new Date('2027-07-01T00:00:00.000Z'),
    });
    const { event: cascadeEvent, eventTimeBlocks: createdBlocks } =
      await eventManager.createEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        title: 'Cascade day',
        start: new Date('2027-06-02T09:00:00.000Z'),
        end: new Date('2027-06-02T12:00:00.000Z'),
        eventTimeBlocks: [
          {
            label: 'Opening',
            startTime: new Date('2027-06-02T09:00:00.000Z'),
            endTime: new Date('2027-06-02T10:00:00.000Z'),
          },
        ],
      });
    const [eventTimeBlockOne] = await schedulingTestDb
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.id, createdBlocks[0]?.id ?? ''));
    if (!eventTimeBlockOne) throw new Error('expected the created block');
    const eventTimeBlockTwo = await seedEventTimeBlock({
      churchId: seed.churchAId,
      eventId: cascadeEvent.id,
      startTime: new Date('2027-06-02T10:30:00.000Z'),
      endTime: new Date('2027-06-02T11:30:00.000Z'),
    });

    // Changing only title/endDate must NOT move any event time block.
    await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: cascadeEvent.id,
      title: 'Cascade day (retitled)',
      end: new Date('2027-06-05T00:00:00.000Z'),
    });
    const eventTimeBlocksAfterNonDateEdit = await schedulingTestDb
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, cascadeEvent.id));
    for (const eventTimeBlock of eventTimeBlocksAfterNonDateEdit) {
      const original = [eventTimeBlockOne, eventTimeBlockTwo].find(
        (s) => s.id === eventTimeBlock.id,
      );
      expect(eventTimeBlock.startTime.getTime()).toBe(
        original?.startTime.getTime(),
      );
      expect(eventTimeBlock.endTime.getTime()).toBe(
        original?.endTime.getTime(),
      );
    }

    // Changing startDate by 2 days + 3 hours must shift every event time block by the
    // same delta, preserving each event time block's own duration.
    const newStartDate = new Date('2027-06-04T12:00:00.000Z');
    const delta =
      newStartDate.getTime() - new Date('2027-06-02T09:00:00.000Z').getTime();

    await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: cascadeEvent.id,
      start: newStartDate,
    });

    const eventTimeBlocksAfterDateShift = await schedulingTestDb
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, cascadeEvent.id));

    for (const original of [eventTimeBlockOne, eventTimeBlockTwo]) {
      const shifted = eventTimeBlocksAfterDateShift.find(
        (s) => s.id === original.id,
      );
      if (!shifted) throw new Error('expected event time block to still exist');
      const originalDuration =
        original.endTime.getTime() - original.startTime.getTime();
      const shiftedDuration =
        shifted.endTime.getTime() - shifted.startTime.getTime();

      expect(shifted.startTime.getTime()).toBe(
        original.startTime.getTime() + delta,
      );
      expect(shifted.endTime.getTime()).toBe(
        original.endTime.getTime() + delta,
      );
      expect(shiftedDuration).toBe(originalDuration);
    }

    // Atomic rollback: if an event time block in the cascade loop fails partway through,
    // the whole transaction — including the event's own startDate — must
    // roll back together, not leave a half-shifted day.
    const {
      event: rollbackEvent,
      eventTimeBlocks: [survivingEventTimeBlock],
    } = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Rollback day',
      start: new Date('2027-06-10T09:00:00.000Z'),
      end: new Date('2027-06-10T10:00:00.000Z'),
      eventTimeBlocks: [
        {
          label: 'Surviving',
          startTime: new Date('2027-06-10T09:00:00.000Z'),
          endTime: new Date('2027-06-10T10:00:00.000Z'),
        },
      ],
    });
    if (!survivingEventTimeBlock) throw new Error('expected the created block');
    const failingEventTimeBlock = await seedEventTimeBlock({
      churchId: seed.churchAId,
      eventId: rollbackEvent.id,
      startTime: new Date('2027-06-10T10:00:00.000Z'),
      endTime: new Date('2027-06-10T11:00:00.000Z'),
    });

    const realUpdate = eventTimeBlockRepository.update.bind(
      eventTimeBlockRepository,
    );
    const updateSpy = vi
      .spyOn(eventTimeBlockRepository, 'update')
      .mockImplementation((input) => {
        if (input.eventTimeBlockId === failingEventTimeBlock.id) {
          throw new Error('Simulated mid-cascade failure');
        }
        return realUpdate(input);
      });

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: EventId.from(rollbackEvent.id),
        start: new Date('2027-06-10T09:30:00.000Z'),
        end: new Date('2027-06-10T10:30:00.000Z'),
      }),
    ).rejects.toThrow('Simulated mid-cascade failure');

    updateSpy.mockRestore();

    const [rolledBackEvent] = await schedulingTestDb
      .select()
      .from(event)
      .where(eq(event.id, rollbackEvent.id));
    expect(rolledBackEvent?.start.getTime()).toBe(
      new Date('2027-06-10T09:00:00.000Z').getTime(),
    );
    expect(rolledBackEvent?.end.getTime()).toBe(
      new Date('2027-06-10T10:00:00.000Z').getTime(),
    );

    const [survivingEventTimeBlockAfterRollback] = await schedulingTestDb
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.id, survivingEventTimeBlock.id));
    expect(survivingEventTimeBlockAfterRollback?.startTime.getTime()).toBe(
      new Date('2027-06-10T09:00:00.000Z').getTime(),
    );
  });
});
