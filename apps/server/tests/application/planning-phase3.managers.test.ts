import {
  event,
  eventTimeBlock,
  participationEventTimeBlockInclusion,
  shiftRequirement,
  shift as shiftTable,
  usualSetup,
} from '@church/db';
import {
  addMilliseconds,
  calendarDayBounds,
  formatCalendarDay,
  fromDate,
  parseCalendarDay,
  toDate,
  today,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import {
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
} from '@/domain/branded-ids';
import {
  EventOutsideCycleError,
  IllegalStateTransitionError,
  LastRemainingEventTimeBlockError,
  OverlappingCycleError,
} from '@/domain/errors';
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
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTimeBlock } from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
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

  return {
    cycleManager: new DbCycleManager({
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
    }),
    eventManager: new DbPlanningEventManager({
      cycleRepository,
      eventRepository,
      templateRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      shiftRepository,
      usualSetupRepository,
      ministryRepository,
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

/**
 * Flip an event straight to `scheduled` — the state a per-event schedule
 * publish (`assignment-manager-service.markScheduled`) leaves it in — without
 * standing up the whole assign flow. Lets tests exercise `cancelEvent`'s
 * soft-cancel branch, which keys only on `event.status`.
 */
async function markEventScheduled(eventId: string): Promise<void> {
  await schedulingTestDb
    .update(event)
    .set({ status: 'scheduled' })
    .where(eq(event.id, eventId));
}

describe('Phase 3 planning managers', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('creates cycles, rejects overlaps, and allows adjacent or cross-church ranges', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const churchBId = ChurchId.from(seed.churchBId);

    const created = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    await expect(
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Overlap',
        startDate: new Date('2026-08-15T00:00:00.000Z'),
        endDate: new Date('2026-09-15T00:00:00.000Z'),
      }),
    ).rejects.toThrow(OverlappingCycleError);

    await expect(
      cycleManager.createCycle({
        churchId: churchAId,
        name: 'Adjacent',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ).resolves.toBeDefined();

    await expect(
      cycleManager.createCycle({
        churchId: churchBId,
        name: 'Other Church',
        startDate: new Date('2026-08-15T00:00:00.000Z'),
        endDate: new Date('2026-09-15T00:00:00.000Z'),
      }),
    ).resolves.toBeDefined();

    const details = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: created.id,
    });

    expect(details.cycle.name).toBe('August 2026');
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

  it('sends cycle events, lazily marks expired cycles past, and blocks writes once past', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const activeCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Active',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2099-09-01T00:00:00.000Z'),
    });

    const createdEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: activeCycle.id,
      title: 'Sunday Service',
      start: new Date('2026-08-02T12:00:00.000Z'),
      end: new Date('2026-08-02T14:00:00.000Z'),
    });

    await cycleManager.sendCycle({
      churchId: churchAId,
      cycleId: activeCycle.id,
    });

    const sentDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: activeCycle.id,
    });

    expect(sentDetails.events[0]?.event.status).toBe('scheduled');

    const expiredCycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Expired',
      startDate: new Date('2000-01-01T00:00:00.000Z'),
      endDate: new Date('2000-02-01T00:00:00.000Z'),
    });
    const expiredDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: CycleId.from(expiredCycle.id),
    });

    expect(expiredDetails.cycle.state).toBe('past');

    await expect(
      eventManager.createEvent({
        churchId: churchAId,
        cycleId: CycleId.from(expiredCycle.id),
        title: 'Too Late',
        start: new Date('2000-01-10T12:00:00.000Z'),
        end: new Date('2000-01-10T14:00:00.000Z'),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    expect(createdEvent.title).toBe('Sunday Service');

    await expect(
      cycleManager.sendCycle({
        churchId: churchAId,
        cycleId: CycleId.from(expiredCycle.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('rejects a manual event whose start date falls outside the cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'August cycle',
      startDate: new Date('2027-08-01T00:00:00.000Z'),
      endDate: new Date('2027-09-01T00:00:00.000Z'),
    });

    await expect(
      eventManager.createEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        title: 'Outside cycle',
        start: new Date('2027-10-05T12:00:00.000Z'),
        end: new Date('2027-10-05T14:00:00.000Z'),
      }),
    ).rejects.toThrow(EventOutsideCycleError);
  });

  it('creates a manual event on the selected church calendar date', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'November cycle',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
    });

    // Quick-create sends the picked day as church-local midnight bounds.
    const created = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'November first',
      start: toDate({
        instant: calendarDayBounds({
          day: parseCalendarDay({ value: '2026-11-01' }),
          timeZone: seed.churchATimezone,
        }).start,
      }),
      end: toDate({
        instant: addMilliseconds({
          instant: calendarDayBounds({
            day: parseCalendarDay({ value: '2026-11-01' }),
            timeZone: seed.churchATimezone,
          }).end,
          milliseconds: -1,
        }),
      }),
    });

    expect(
      formatCalendarDay({
        day: today({
          instant: created.start,
          timeZone: seed.churchATimezone,
        }),
      }),
    ).toBe('01/11/2026');
    expect(
      formatCalendarDay({
        day: today({
          instant: created.end,
          timeZone: seed.churchATimezone,
        }),
      }),
    ).toBe('01/11/2026');
  });

  it('applies templates idempotently and requires reopen before editing a locked event', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, templateManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'December 2026',
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
    });

    const template = await templateManager.createTemplate({
      churchId: churchAId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [
        {
          label: 'Welcome',
          startTime: '09:00:00',
          endTime: '09:30:00',
        },
        {
          label: 'Message',
          startTime: '09:30:00',
          endTime: '10:30:00',
        },
      ],
    });

    const firstRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    const secondRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });

    expect(firstRun.generatedEventCount).toBeGreaterThan(0);
    expect(firstRun.generatedEventTimeBlockCount).toBeGreaterThan(0);
    expect(secondRun.generatedEventCount).toBe(0);
    expect(secondRun.generatedEventTimeBlockCount).toBe(0);

    await cycleManager.sendCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });

    const sentDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const sentEvent = sentDetails.events[0]?.event;
    if (!sentEvent) {
      throw new Error('Expected generated locked event');
    }

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: sentEvent.id,
        title: 'Retitled without reopen',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    await cycleManager.reopenEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: sentEvent.id,
    });

    const updated = await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: sentEvent.id,
      title: 'Retitled with reopen',
    });

    expect(updated.title).toBe('Retitled with reopen');
    expect(updated.status).toBe('scheduled');

    // Cycle is already locked (above) — a manually created event must land
    // directly as 'scheduled', not 'draft'.
    const manualPostLockEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Added after lock',
      start: new Date('2026-12-10T12:00:00.000Z'),
      end: new Date('2026-12-10T14:00:00.000Z'),
    });
    expect(manualPostLockEvent.status).toBe('scheduled');

    const postLockTemplate = await templateManager.createTemplate({
      churchId: churchAId,
      name: 'Wednesday Service',
      weekday: 3,
      blocks: [
        {
          label: 'Bible study',
          startTime: '19:00:00',
          endTime: '20:00:00',
        },
      ],
    });

    const postLockRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [postLockTemplate.id],
    });

    expect(postLockRun.generatedEventCount).toBeGreaterThan(0);

    const postLockDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const postLockEvent = postLockDetails.events.find(
      (eventGroup) => eventGroup.event.sourceTemplateId === postLockTemplate.id,
    )?.event;

    // Events generated after the cycle is already locked must land directly
    // as 'scheduled', not 'draft' (they'd otherwise never get promoted).
    expect(postLockEvent?.status).toBe('scheduled');
  });

  it('cancelEvent hard-deletes a draft event, is blocked on a sent cycle unless the event is still draft, and hard-deletes again after reopen', async () => {
    // BL-020 / issue #12: delete and cancel are split on the event's lifecycle
    // status. `draft` (never reached `scheduled`) → hard delete; any later
    // status → soft cancel.
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const draftCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Cancel in draft cycle',
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-02-01T00:00:00.000Z'),
    });
    const draftEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Cancel me (draft cycle)',
      start: new Date('2027-01-05T09:00:00.000Z'),
      end: new Date('2027-01-05T10:00:00.000Z'),
    });

    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: draftEvent.id,
    });

    // Draft event row is gone, not left wearing a `cancelled` badge.
    const afterCancel = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: draftCycle.id,
    });
    expect(afterCancel.events).toHaveLength(0);

    const sentCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Cancel in sent cycle',
      startDate: new Date('2027-02-01T00:00:00.000Z'),
      endDate: new Date('2027-03-01T00:00:00.000Z'),
    });
    const sentEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: sentCycle.id,
      title: 'Scheduled once locked',
      start: new Date('2027-02-05T09:00:00.000Z'),
      end: new Date('2027-02-05T10:00:00.000Z'),
    });
    await cycleManager.sendCycle({
      churchId: churchAId,
      cycleId: sentCycle.id,
    });

    await expect(
      eventManager.cancelEvent({
        churchId: churchAId,
        cycleId: sentCycle.id,
        eventId: sentEvent.id,
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    await cycleManager.reopenEvent({
      churchId: churchAId,
      cycleId: sentCycle.id,
      eventId: sentEvent.id,
    });

    // Reopen flips the event back to `draft`; cancelling it now hard-deletes,
    // the same case `reopenEvent` already treats as legitimately mutable.
    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: sentCycle.id,
      eventId: sentEvent.id,
    });

    const finalDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: sentCycle.id,
    });
    expect(finalDetails.events).toHaveLength(0);
  });

  it('cancelEvent soft-cancels a scheduled event and leaves its row in place', async () => {
    // The soft-cancel branch: an event already assigned to `scheduled` while
    // its cycle is still draft. Behaviour is byte-for-byte today's — a silent
    // status flip, no hard delete.
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Soft cancel cycle',
      startDate: new Date('2027-04-01T00:00:00.000Z'),
      endDate: new Date('2027-05-01T00:00:00.000Z'),
    });
    const scheduledEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Scheduled service',
      start: new Date('2027-04-05T09:00:00.000Z'),
      end: new Date('2027-04-05T10:00:00.000Z'),
    });
    await markEventScheduled(scheduledEvent.id);

    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: scheduledEvent.id,
    });

    const afterCancel = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    expect(afterCancel.events).toHaveLength(1);
    expect(afterCancel.events[0]?.event.status).toBe('cancelled');
  });

  it('regenerates events and event time blocks after every generated draft event is deleted, stays idempotent, and never resurrects a soft-cancelled event', async () => {
    // BL-020 success criteria 1, 2 and 4.
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, templateManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Regenerate after delete',
      startDate: new Date('2027-06-01T00:00:00.000Z'),
      endDate: new Date('2027-07-01T00:00:00.000Z'),
    });
    const template = await templateManager.createTemplate({
      churchId: churchAId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [
        {
          label: 'Welcome',
          startTime: '09:00:00',
          endTime: '09:30:00',
        },
        {
          label: 'Message',
          startTime: '09:30:00',
          endTime: '10:30:00',
        },
      ],
    });

    const firstRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(firstRun.generatedEventCount).toBeGreaterThan(0);
    expect(firstRun.generatedEventTimeBlockCount).toBeGreaterThan(0);

    // Idempotent while the events are still present.
    const rerunWithEvents = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(rerunWithEvents.generatedEventCount).toBe(0);
    expect(rerunWithEvents.generatedEventTimeBlockCount).toBe(0);

    const generated = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const generatedEvents = generated.events;
    expect(generatedEvents.length).toBe(firstRun.generatedEventCount);

    // Partial delete: drop the first generated event only, then regenerate.
    const firstEventId = generatedEvents[0]?.event.id;
    if (!firstEventId) {
      throw new Error('Expected at least one generated event');
    }
    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: firstEventId,
    });

    const afterPartialDelete = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    expect(afterPartialDelete.events.length).toBe(generatedEvents.length - 1);

    const partialRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(partialRun.generatedEventCount).toBe(1);
    expect(partialRun.generatedEventTimeBlockCount).toBe(2);

    // Delete every remaining generated draft event, then regenerate the lot.
    const remaining = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    for (const eventGroup of remaining.events) {
      await eventManager.cancelEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: eventGroup.event.id,
      });
    }

    const emptied = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    expect(emptied.events).toHaveLength(0);

    const fullRegen = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(fullRegen.generatedEventCount).toBe(firstRun.generatedEventCount);
    expect(fullRegen.generatedEventTimeBlockCount).toBe(
      firstRun.generatedEventTimeBlockCount,
    );

    // Non-resurrection: soft-cancel one regenerated event (already assigned to
    // `scheduled`), then re-apply the template. That date must stay empty.
    const regenerated = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const toCancelId = regenerated.events[0]?.event.id;
    if (!toCancelId) {
      throw new Error('Expected at least one regenerated event');
    }
    await markEventScheduled(toCancelId);
    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: toCancelId,
    });

    const nonResurrectionRun = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(nonResurrectionRun.generatedEventCount).toBe(0);
    expect(nonResurrectionRun.generatedEventTimeBlockCount).toBe(0);

    const finalState = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    expect(
      finalState.events.filter(
        (eventGroup) => eventGroup.event.status === 'cancelled',
      ),
    ).toHaveLength(1);
  });

  it('treats an Event addressed under another Cycle as not found and writes nothing', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const addressedCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Addressed cycle',
      startDate: new Date('2027-05-01T00:00:00.000Z'),
      endDate: new Date('2027-06-01T00:00:00.000Z'),
    });
    const owningCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Owning cycle',
      startDate: new Date('2027-06-01T00:00:00.000Z'),
      endDate: new Date('2027-07-01T00:00:00.000Z'),
    });
    const owned = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: owningCycle.id,
      title: 'Owned event',
      start: new Date('2027-06-05T09:00:00.000Z'),
      end: new Date('2027-06-05T10:00:00.000Z'),
    });
    const mismatched = {
      churchId: churchAId,
      cycleId: addressedCycle.id,
      eventId: owned.id,
    };
    const notFound = {
      code: 'NOT_FOUND',
      message: `Event not found: ${owned.id}`,
    };
    const countBlocks = async () =>
      (
        await schedulingTestDb
          .select()
          .from(eventTimeBlock)
          .where(eq(eventTimeBlock.eventId, owned.id))
      ).length;
    const blocksBefore = await countBlocks();

    await expect(
      eventManager.updateEvent({ ...mismatched, title: 'Renamed' }),
    ).rejects.toMatchObject(notFound);
    await expect(eventManager.cancelEvent(mismatched)).rejects.toMatchObject(
      notFound,
    );
    await expect(
      eventManager.createEventTimeBlock({
        ...mismatched,
        startTime: new Date('2027-06-05T09:00:00.000Z'),
        endTime: new Date('2027-06-05T09:30:00.000Z'),
      }),
    ).rejects.toMatchObject(notFound);
    await expect(cycleManager.reopenEvent(mismatched)).rejects.toMatchObject(
      notFound,
    );

    const [row] = await schedulingTestDb
      .select()
      .from(event)
      .where(eq(event.id, owned.id));
    expect(row).toMatchObject({ title: 'Owned event', status: 'draft' });
    expect(await countBlocks()).toBe(blocksBefore);
  });

  it('updateEvent rejects moving a startDate outside its cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Update bounds cycle',
      startDate: new Date('2027-03-01T00:00:00.000Z'),
      endDate: new Date('2027-04-01T00:00:00.000Z'),
    });
    const event = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Movable event',
      start: new Date('2027-03-05T09:00:00.000Z'),
      end: new Date('2027-03-05T10:00:00.000Z'),
    });

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: event.id,
        start: new Date('2027-04-15T09:00:00.000Z'),
      }),
    ).rejects.toThrow(EventOutsideCycleError);
  });

  it('generateFromTemplates seeds via the three-tier default: explicit profile > ministry direction > (all_out default), including split shifts and headcounts', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, templateManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    // ministryA (from base seed) is left at its DB default_direction, 'all_out'.
    const allInMinistry = await buildMinistry({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      name: 'All-in ministry',
      defaultDirection: 'all_in',
    });
    const profiledMinistry = await buildMinistry({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      name: 'Profiled ministry',
      defaultDirection: 'all_out',
    });
    const excludedByProfileMinistry = await buildMinistry({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      name: 'Explicitly excluded ministry',
      defaultDirection: 'all_in',
    });

    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Seeding tiers cycle',
      startDate: new Date('2027-05-01T00:00:00.000Z'),
      endDate: new Date('2027-06-01T00:00:00.000Z'),
    });
    const template = await templateManager.createTemplate({
      churchId: churchAId,
      name: 'Tiered Sunday',
      weekday: 0,
      blocks: [
        {
          label: 'Service',
          startTime: '09:00:00',
          endTime: '10:00:00',
        },
      ],
    });
    const block = template.blocks[0];
    if (!block) throw new Error('template block seed failed');

    const roleRow = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: profiledMinistry.id,
      name: 'Profiled role',
    });
    const babiesRoom = await buildSector({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: profiledMinistry.id,
      name: 'Babies Room',
    });
    const kidsRoom = await buildSector({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: profiledMinistry.id,
      name: 'Kids Room',
    });

    await schedulingTestDb.insert(usualSetup).values([
      {
        churchId: seed.churchAId,
        ministryId: profiledMinistry.id,
        sourceTemplateTimeBlockId: block.id,
        serves: true,
        shiftSplit: { kind: 'equal', count: 2 },
        headcounts: [
          { sectorId: babiesRoom.id, roleId: roleRow.id, peopleNeeded: 2 },
          { sectorId: kidsRoom.id, roleId: roleRow.id, peopleNeeded: 1 },
        ],
      },
      {
        churchId: seed.churchAId,
        ministryId: excludedByProfileMinistry.id,
        sourceTemplateTimeBlockId: block.id,
        serves: false,
        shiftSplit: { kind: 'equal', count: 1 },
        headcounts: [],
      },
    ]);

    const result = await eventManager.generateFromTemplates({
      churchId: churchAId,
      cycleId: cycle.id,
      templateIds: [template.id],
    });
    expect(result.generatedEventCount).toBeGreaterThan(0);

    const cycleDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const generatedEvent = cycleDetails.events[0]?.event;
    if (!generatedEvent) throw new Error('expected a generated event');
    const generatedEventId = generatedEvent.id;

    async function participationIdFor(ministryId: string) {
      const result = await schedulingTestDb.execute(
        `SELECT id FROM ministry_participation WHERE ministry_id = '${ministryId}' AND event_id = '${generatedEventId}'`,
      );
      const participationRow = result.rows[0] as { id: string } | undefined;
      if (!participationRow) {
        throw new Error(`no participation for ministry ${ministryId}`);
      }
      return participationRow.id;
    }

    // ministryA: default direction (all_out), no profile -> excluded entirely.
    const ministryAParticipationId = await participationIdFor(seed.ministryAId);
    const ministryAInclusions = await schedulingTestDb
      .select()
      .from(participationEventTimeBlockInclusion)
      .where(
        eq(
          participationEventTimeBlockInclusion.participationId,
          ministryAParticipationId,
        ),
      );
    expect(ministryAInclusions).toHaveLength(0);

    // all_in ministry, no profile entry -> whole-event-time-block shift, no requirements.
    const allInParticipationId = await participationIdFor(allInMinistry.id);
    const allInInclusions = await schedulingTestDb
      .select()
      .from(participationEventTimeBlockInclusion)
      .where(
        eq(
          participationEventTimeBlockInclusion.participationId,
          allInParticipationId,
        ),
      );
    expect(allInInclusions).toHaveLength(1);
    const allInShifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, allInParticipationId));
    expect(allInShifts).toHaveLength(1);

    // profiled ministry (all_out direction, but explicit serves:true equal-2 profile) -> 2 shifts, each with the profile's Sector headcounts.
    const profiledParticipationId = await participationIdFor(
      profiledMinistry.id,
    );
    const profiledShifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, profiledParticipationId));
    expect(profiledShifts).toHaveLength(2);
    const profiledRequirements = await schedulingTestDb
      .select()
      .from(shiftRequirement)
      .where(eq(shiftRequirement.participationId, profiledParticipationId));
    expect(
      profiledRequirements
        .map(({ shiftId, sectorId, roleId, peopleNeeded }) => ({
          shiftId,
          sectorId,
          roleId,
          peopleNeeded,
        }))
        .sort((a, b) =>
          `${a.shiftId}${a.peopleNeeded}`.localeCompare(
            `${b.shiftId}${b.peopleNeeded}`,
          ),
        ),
    ).toEqual(
      profiledShifts
        .map((shift) => shift.id)
        .sort()
        .flatMap((shiftId) => [
          {
            shiftId,
            sectorId: kidsRoom.id,
            roleId: roleRow.id,
            peopleNeeded: 1,
          },
          {
            shiftId,
            sectorId: babiesRoom.id,
            roleId: roleRow.id,
            peopleNeeded: 2,
          },
        ]),
    );

    // ministry with default all_in, but explicit serves:false profile entry -> still excluded (profile wins over direction).
    const excludedParticipationId = await participationIdFor(
      excludedByProfileMinistry.id,
    );
    const excludedInclusions = await schedulingTestDb
      .select()
      .from(participationEventTimeBlockInclusion)
      .where(
        eq(
          participationEventTimeBlockInclusion.participationId,
          excludedParticipationId,
        ),
      );
    expect(excludedInclusions).toHaveLength(0);
  });

  it('createEventTimeBlock: happy path on a draft cycle, rejected on a sent cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const draftCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Create event time block cycle',
      startDate: new Date('2027-08-01T00:00:00.000Z'),
      endDate: new Date('2027-09-01T00:00:00.000Z'),
    });
    const event = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Bare manual day',
      start: new Date('2027-08-02T00:00:00.000Z'),
      end: new Date('2027-08-02T23:59:59.999Z'),
    });

    const created = await eventManager.createEventTimeBlock({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: event.id,
      startTime: new Date('2027-08-02T09:00:00.000Z'),
      endTime: new Date('2027-08-02T10:00:00.000Z'),
      label: 'Worship',
    });

    expect(created.label).toBe('Worship');
    expect(created.eventId).toBe(event.id);

    const sentCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Create event time block sent cycle',
      startDate: new Date('2027-09-01T00:00:00.000Z'),
      endDate: new Date('2027-10-01T00:00:00.000Z'),
    });
    const sentEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: sentCycle.id,
      title: 'Locked day',
      start: new Date('2027-09-02T00:00:00.000Z'),
      end: new Date('2027-09-02T23:59:59.999Z'),
    });
    await cycleManager.sendCycle({
      churchId: churchAId,
      cycleId: sentCycle.id,
    });

    await expect(
      eventManager.createEventTimeBlock({
        churchId: churchAId,
        cycleId: sentCycle.id,
        eventId: sentEvent.id,
        startTime: new Date('2027-09-02T09:00:00.000Z'),
        endTime: new Date('2027-09-02T10:00:00.000Z'),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('updateEventTimeBlock/deleteEventTimeBlock: happy paths, ownership/sent-cycle guards, and last-remaining-event-time-block rejection', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const draftCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Event time block mutation cycle',
      startDate: new Date('2027-05-01T00:00:00.000Z'),
      endDate: new Date('2027-06-01T00:00:00.000Z'),
    });

    const twoEventTimeBlockEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Two-block day',
      start: new Date('2027-05-02T09:00:00.000Z'),
      end: new Date('2027-05-02T12:00:00.000Z'),
    });
    const [eventTimeBlockA, eventTimeBlockB] = await Promise.all([
      seedEventTimeBlock({
        churchId: seed.churchAId,
        eventId: twoEventTimeBlockEvent.id,
        startTime: new Date('2027-05-02T09:00:00.000Z'),
        endTime: new Date('2027-05-02T10:00:00.000Z'),
        label: 'Worship',
      }),
      seedEventTimeBlock({
        churchId: seed.churchAId,
        eventId: twoEventTimeBlockEvent.id,
        startTime: new Date('2027-05-02T10:00:00.000Z'),
        endTime: new Date('2027-05-02T11:00:00.000Z'),
        label: 'Message',
      }),
    ]);

    // Happy-path update.
    const updated = await eventManager.updateEventTimeBlock({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: twoEventTimeBlockEvent.id,
      eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockA.id),
      label: 'Renamed event time block',
    });
    expect(updated.label).toBe('Renamed event time block');

    // Happy-path delete (non-last event time block).
    await eventManager.deleteEventTimeBlock({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: twoEventTimeBlockEvent.id,
      eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockB.id),
    });
    const remaining = await schedulingTestDb
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, twoEventTimeBlockEvent.id));
    expect(remaining).toHaveLength(1);

    // Reject deleting a day's only remaining event time block.
    await expect(
      eventManager.deleteEventTimeBlock({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: twoEventTimeBlockEvent.id,
        eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockA.id),
      }),
    ).rejects.toThrow(LastRemainingEventTimeBlockError);

    // Reject when event time block/event/cycle triple mismatches (event time block belongs to a
    // different event than the one supplied).
    const otherEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Other day',
      start: new Date('2027-05-03T09:00:00.000Z'),
      end: new Date('2027-05-03T10:00:00.000Z'),
    });
    await expect(
      eventManager.updateEventTimeBlock({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: otherEvent.id,
        eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockA.id),
        label: 'Mismatched',
      }),
    ).rejects.toThrow('EventTimeBlock not found');

    // Reject on past cycle.
    const pastCycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Past event time block cycle',
      startDate: new Date('2000-01-01T00:00:00.000Z'),
      endDate: new Date('2000-02-01T00:00:00.000Z'),
    });
    await expect(
      eventManager.updateEventTimeBlock({
        churchId: churchAId,
        cycleId: CycleId.from(pastCycle.id),
        eventId: twoEventTimeBlockEvent.id,
        eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockA.id),
        label: 'Past',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    // Reject when the cycle locks between load and mutation (re-fetched
    // fresh inside the same transaction, so a lock that lands before the
    // call is always observed).
    const raceEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Race day',
      start: new Date('2027-05-04T09:00:00.000Z'),
      end: new Date('2027-05-04T10:00:00.000Z'),
    });
    const raceEventTimeBlock = await seedEventTimeBlock({
      churchId: seed.churchAId,
      eventId: raceEvent.id,
      startTime: new Date('2027-05-04T09:00:00.000Z'),
      endTime: new Date('2027-05-04T10:00:00.000Z'),
    });
    await cycleManager.sendCycle({
      churchId: churchAId,
      cycleId: draftCycle.id,
    });

    await expect(
      eventManager.updateEventTimeBlock({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: raceEvent.id,
        eventTimeBlockId: EventTimeBlockId.from(raceEventTimeBlock.id),
        label: 'Too late',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      eventManager.deleteEventTimeBlock({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: raceEvent.id,
        eventTimeBlockId: EventTimeBlockId.from(raceEventTimeBlock.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
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
    const cascadeEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Cascade day',
      start: new Date('2027-06-02T09:00:00.000Z'),
      end: new Date('2027-06-02T12:00:00.000Z'),
    });
    const [eventTimeBlockOne, eventTimeBlockTwo] = await Promise.all([
      seedEventTimeBlock({
        churchId: seed.churchAId,
        eventId: cascadeEvent.id,
        startTime: new Date('2027-06-02T09:00:00.000Z'),
        endTime: new Date('2027-06-02T10:00:00.000Z'),
      }),
      seedEventTimeBlock({
        churchId: seed.churchAId,
        eventId: cascadeEvent.id,
        startTime: new Date('2027-06-02T10:30:00.000Z'),
        endTime: new Date('2027-06-02T11:30:00.000Z'),
      }),
    ]);

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
    const rollbackEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Rollback day',
      start: new Date('2027-06-10T09:00:00.000Z'),
      end: new Date('2027-06-10T10:00:00.000Z'),
    });
    const survivingEventTimeBlock = await seedEventTimeBlock({
      churchId: seed.churchAId,
      eventId: rollbackEvent.id,
      startTime: new Date('2027-06-10T09:00:00.000Z'),
      endTime: new Date('2027-06-10T10:00:00.000Z'),
    });
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
