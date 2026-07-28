import { randomUUID } from 'node:crypto';
import {
  event,
  ministry,
  ministryServingProfile,
  participationSlotInclusion,
  role,
  shift as shiftTable,
  slotRequirement,
  timeSlot,
} from '@church/db';
import { formatInTimeZone } from 'date-fns-tz';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbEventTemplateManager } from '../../src/application/db-event-template-manager';
import { DbPlanningCycleManager } from '../../src/application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../src/application/db-planning-event-manager';
import {
  ChurchId,
  EventId,
  PlanningCycleId,
  TimeSlotId,
} from '../../src/domain/branded-ids';
import {
  EventOutsidePlanningCycleError,
  IllegalStateTransitionError,
  LastRemainingSlotError,
  OverlappingCycleError,
} from '../../src/domain/errors';
import { DrizzleChurchRepository } from '../../src/infrastructure/repositories/drizzle-church.repository';
import { DrizzleEventTemplateRepository } from '../../src/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningCycleRepository } from '../../src/infrastructure/repositories/drizzle-planning-cycle.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '../../src/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { SchedulingFeatureFlagServiceStub } from '../../src/test-support/feature-flag-service-stub';
import {
  createSchedulingPhase3Cycle,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';

function createManagers() {
  const cycleRepository = new DrizzlePlanningCycleRepository(schedulingTestDb);
  const eventRepository = new DrizzlePlanningEventRepository(schedulingTestDb);
  const templateRepository = new DrizzleEventTemplateRepository(
    schedulingTestDb,
  );
  const churchRepository = new DrizzleChurchRepository({
    db: schedulingTestDb,
  });
  const unitOfWork = new DrizzleUnitOfWork(schedulingTestDb);
  const participationRepository = new DrizzleMinistryParticipationRepository(
    schedulingTestDb,
  );
  const shiftRepository = new DrizzleShiftRepository(schedulingTestDb);
  const servingProfileRepository = new DrizzleMinistryServingProfileRepository(
    schedulingTestDb,
  );
  const ministryRepository = new DrizzleMinistryRepository(schedulingTestDb);
  const featureFlagService = new SchedulingFeatureFlagServiceStub({
    participationDefaultAllIn: false,
    volunteerDashboardAllowOverlapSave: false,
  });
  const timeSlotRepository = new DrizzleTimeSlotRepository(schedulingTestDb);

  return {
    cycleManager: new DbPlanningCycleManager(
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
    ),
    eventManager: new DbPlanningEventManager(
      cycleRepository,
      eventRepository,
      templateRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      shiftRepository,
      servingProfileRepository,
      ministryRepository,
      featureFlagService,
      timeSlotRepository,
    ),
    templateManager: new DbEventTemplateManager(templateRepository),
    timeSlotRepository,
  };
}

interface SeedEventSlotInput {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

async function seedEventSlot(input: SeedEventSlotInput) {
  const [row] = await schedulingTestDb
    .insert(timeSlot)
    .values({
      churchId: input.churchId,
      eventId: input.eventId,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
    })
    .returning();

  if (!row) {
    throw new Error('Scheduling phase 3 slot seed failed');
  }

  return row;
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

  it('locks cycle events, lazily archives expired cycles, and blocks writes after archive', async () => {
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
      startDate: new Date('2026-08-02T12:00:00.000Z'),
      endDate: new Date('2026-08-02T14:00:00.000Z'),
    });

    await cycleManager.lockCycle({
      churchId: churchAId,
      cycleId: activeCycle.id,
    });

    const lockedDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: activeCycle.id,
    });

    expect(lockedDetails.events[0]?.event.status).toBe('scheduled');

    const expiredCycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Expired',
      startDate: new Date('2000-01-01T00:00:00.000Z'),
      endDate: new Date('2000-02-01T00:00:00.000Z'),
    });
    const expiredDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: PlanningCycleId.from(expiredCycle.id),
    });

    expect(expiredDetails.cycle.state).toBe('archived');

    await expect(
      eventManager.createEvent({
        churchId: churchAId,
        cycleId: PlanningCycleId.from(expiredCycle.id),
        title: 'Too Late',
        startDate: new Date('2000-01-10T12:00:00.000Z'),
        endDate: new Date('2000-01-10T14:00:00.000Z'),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    expect(createdEvent.title).toBe('Sunday Service');

    await expect(
      cycleManager.lockCycle({
        churchId: churchAId,
        cycleId: PlanningCycleId.from(expiredCycle.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('rejects a manual event whose start date falls outside the planning cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);
    const cycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'August cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    await expect(
      eventManager.createEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        title: 'Outside cycle',
        startDate: new Date('2026-10-05T12:00:00.000Z'),
        endDate: new Date('2026-10-05T14:00:00.000Z'),
      }),
    ).rejects.toThrow(EventOutsidePlanningCycleError);
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

    const created = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'November first',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T23:59:59.999Z'),
      datesRepresentChurchCalendarDays: true,
    });

    expect(
      formatInTimeZone(created.startDate, seed.churchATimezone, 'yyyy-MM-dd'),
    ).toBe('2026-11-01');
    expect(
      formatInTimeZone(created.endDate, seed.churchATimezone, 'yyyy-MM-dd'),
    ).toBe('2026-11-01');
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
          order: 0,
        },
        {
          label: 'Message',
          startTime: '09:30:00',
          endTime: '10:30:00',
          order: 1,
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
    expect(firstRun.generatedSlotCount).toBeGreaterThan(0);
    expect(secondRun.generatedEventCount).toBe(0);
    expect(secondRun.generatedSlotCount).toBe(0);

    await cycleManager.lockCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });

    const lockedDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: cycle.id,
    });
    const lockedEvent = lockedDetails.events[0]?.event;
    if (!lockedEvent) {
      throw new Error('Expected generated locked event');
    }

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: lockedEvent.id,
        title: 'Retitled without reopen',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    await cycleManager.reopenEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: lockedEvent.id,
    });

    const updated = await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: lockedEvent.id,
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
      startDate: new Date('2026-12-10T12:00:00.000Z'),
      endDate: new Date('2026-12-10T14:00:00.000Z'),
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
          order: 0,
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

  it('cancelEvent cancels a draft event freely, is blocked on a locked cycle unless the event is still draft, and works again after reopen', async () => {
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
      startDate: new Date('2027-01-05T09:00:00.000Z'),
      endDate: new Date('2027-01-05T10:00:00.000Z'),
    });

    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: draftEvent.id,
    });

    const afterCancel = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: draftCycle.id,
    });
    expect(afterCancel.events[0]?.event.status).toBe('cancelled');

    const lockedCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Cancel in locked cycle',
      startDate: new Date('2027-02-01T00:00:00.000Z'),
      endDate: new Date('2027-03-01T00:00:00.000Z'),
    });
    const lockedEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: lockedCycle.id,
      title: 'Scheduled once locked',
      startDate: new Date('2027-02-05T09:00:00.000Z'),
      endDate: new Date('2027-02-05T10:00:00.000Z'),
    });
    await cycleManager.lockCycle({
      churchId: churchAId,
      cycleId: lockedCycle.id,
    });

    await expect(
      eventManager.cancelEvent({
        churchId: churchAId,
        cycleId: lockedCycle.id,
        eventId: lockedEvent.id,
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    await cycleManager.reopenEvent({
      churchId: churchAId,
      cycleId: lockedCycle.id,
      eventId: lockedEvent.id,
    });

    await eventManager.cancelEvent({
      churchId: churchAId,
      cycleId: lockedCycle.id,
      eventId: lockedEvent.id,
    });

    const finalDetails = await cycleManager.getCycle({
      churchId: churchAId,
      cycleId: lockedCycle.id,
    });
    expect(finalDetails.events[0]?.event.status).toBe('cancelled');
  });

  it('updateEvent rejects moving a startDate outside its planning cycle', async () => {
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
      startDate: new Date('2027-03-05T09:00:00.000Z'),
      endDate: new Date('2027-03-05T10:00:00.000Z'),
    });

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: event.id,
        startDate: new Date('2027-04-15T09:00:00.000Z'),
      }),
    ).rejects.toThrow(EventOutsidePlanningCycleError);
  });

  it('generateFromTemplates seeds via the three-tier default: explicit profile > ministry direction > (all_out default), including split shifts and headcounts', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, templateManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    // ministryA (from base seed) is left at its DB default_direction, 'all_out'.
    const [allInMinistry] = await schedulingTestDb
      .insert(ministry)
      .values({
        churchId: seed.churchAId,
        name: 'All-in ministry',
        defaultDirection: 'all_in',
      })
      .returning();
    const [profiledMinistry] = await schedulingTestDb
      .insert(ministry)
      .values({
        churchId: seed.churchAId,
        name: 'Profiled ministry',
        defaultDirection: 'all_out',
      })
      .returning();
    const [excludedByProfileMinistry] = await schedulingTestDb
      .insert(ministry)
      .values({
        churchId: seed.churchAId,
        name: 'Explicitly excluded ministry',
        defaultDirection: 'all_in',
      })
      .returning();
    if (!allInMinistry || !profiledMinistry || !excludedByProfileMinistry) {
      throw new Error('ministry seed failed');
    }

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
          order: 0,
        },
      ],
    });
    const block = template.blocks[0];
    if (!block) throw new Error('template block seed failed');

    const roleRow = await schedulingTestDb
      .insert(role)
      .values({
        id: randomUUID(),
        churchId: seed.churchAId,
        ministryId: profiledMinistry.id,
        name: 'Profiled role',
      })
      .returning()
      .then(([row]) => {
        if (!row) throw new Error('role seed failed');
        return row;
      });

    await schedulingTestDb.insert(ministryServingProfile).values([
      {
        churchId: seed.churchAId,
        ministryId: profiledMinistry.id,
        sourceTemplateBlockId: block.id,
        serves: true,
        shiftSplit: { kind: 'equal', count: 2 },
        headcounts: [{ roleId: roleRow.id, count: 2 }],
      },
      {
        churchId: seed.churchAId,
        ministryId: excludedByProfileMinistry.id,
        sourceTemplateBlockId: block.id,
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
      .from(participationSlotInclusion)
      .where(
        eq(
          participationSlotInclusion.participationId,
          ministryAParticipationId,
        ),
      );
    expect(ministryAInclusions).toHaveLength(0);

    // all_in ministry, no profile entry -> whole-slot shift, no requirements.
    const allInParticipationId = await participationIdFor(allInMinistry.id);
    const allInInclusions = await schedulingTestDb
      .select()
      .from(participationSlotInclusion)
      .where(
        eq(participationSlotInclusion.participationId, allInParticipationId),
      );
    expect(allInInclusions).toHaveLength(1);
    const allInShifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, allInParticipationId));
    expect(allInShifts).toHaveLength(1);

    // profiled ministry (all_out direction, but explicit serves:true equal-2 profile) -> 2 shifts + requirements of 2 each.
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
      .from(slotRequirement)
      .where(eq(slotRequirement.participationId, profiledParticipationId));
    expect(profiledRequirements).toHaveLength(2);
    expect(
      profiledRequirements.every(
        (requirement) => requirement.requiredCount === 2,
      ),
    ).toBe(true);

    // ministry with default all_in, but explicit serves:false profile entry -> still excluded (profile wins over direction).
    const excludedParticipationId = await participationIdFor(
      excludedByProfileMinistry.id,
    );
    const excludedInclusions = await schedulingTestDb
      .select()
      .from(participationSlotInclusion)
      .where(
        eq(participationSlotInclusion.participationId, excludedParticipationId),
      );
    expect(excludedInclusions).toHaveLength(0);
  });

  it('createSlot: happy path on a draft cycle, rejected on a locked cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const draftCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Create slot cycle',
      startDate: new Date('2027-08-01T00:00:00.000Z'),
      endDate: new Date('2027-09-01T00:00:00.000Z'),
    });
    const event = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Bare manual day',
      startDate: new Date('2027-08-02T00:00:00.000Z'),
      endDate: new Date('2027-08-02T23:59:59.999Z'),
    });

    const created = await eventManager.createSlot({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: event.id,
      startTime: new Date('2027-08-02T09:00:00.000Z'),
      endTime: new Date('2027-08-02T10:00:00.000Z'),
      label: 'Worship',
    });

    expect(created.label).toBe('Worship');
    expect(created.eventId).toBe(event.id);

    const lockedCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Create slot locked cycle',
      startDate: new Date('2027-09-01T00:00:00.000Z'),
      endDate: new Date('2027-10-01T00:00:00.000Z'),
    });
    const lockedEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: lockedCycle.id,
      title: 'Locked day',
      startDate: new Date('2027-09-02T00:00:00.000Z'),
      endDate: new Date('2027-09-02T23:59:59.999Z'),
    });
    await cycleManager.lockCycle({
      churchId: churchAId,
      cycleId: lockedCycle.id,
    });

    await expect(
      eventManager.createSlot({
        churchId: churchAId,
        cycleId: lockedCycle.id,
        eventId: lockedEvent.id,
        startTime: new Date('2027-09-02T09:00:00.000Z'),
        endTime: new Date('2027-09-02T10:00:00.000Z'),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('updateSlot/deleteSlot: happy paths, ownership/lock guards, and last-remaining-slot rejection', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager } = createManagers();
    const churchAId = ChurchId.from(seed.churchAId);

    const draftCycle = await cycleManager.createCycle({
      churchId: churchAId,
      name: 'Slot mutation cycle',
      startDate: new Date('2027-05-01T00:00:00.000Z'),
      endDate: new Date('2027-06-01T00:00:00.000Z'),
    });

    const twoSlotEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Two-slot day',
      startDate: new Date('2027-05-02T09:00:00.000Z'),
      endDate: new Date('2027-05-02T12:00:00.000Z'),
    });
    const [slotA, slotB] = await Promise.all([
      seedEventSlot({
        churchId: seed.churchAId,
        eventId: twoSlotEvent.id,
        startTime: new Date('2027-05-02T09:00:00.000Z'),
        endTime: new Date('2027-05-02T10:00:00.000Z'),
        label: 'Worship',
      }),
      seedEventSlot({
        churchId: seed.churchAId,
        eventId: twoSlotEvent.id,
        startTime: new Date('2027-05-02T10:00:00.000Z'),
        endTime: new Date('2027-05-02T11:00:00.000Z'),
        label: 'Message',
      }),
    ]);

    // Happy-path update.
    const updated = await eventManager.updateSlot({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: twoSlotEvent.id,
      slotId: TimeSlotId.from(slotA.id),
      label: 'Renamed slot',
    });
    expect(updated.label).toBe('Renamed slot');

    // Happy-path delete (non-last slot).
    await eventManager.deleteSlot({
      churchId: churchAId,
      cycleId: draftCycle.id,
      eventId: twoSlotEvent.id,
      slotId: TimeSlotId.from(slotB.id),
    });
    const remaining = await schedulingTestDb
      .select()
      .from(timeSlot)
      .where(eq(timeSlot.eventId, twoSlotEvent.id));
    expect(remaining).toHaveLength(1);

    // Reject deleting a day's only remaining slot.
    await expect(
      eventManager.deleteSlot({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: twoSlotEvent.id,
        slotId: TimeSlotId.from(slotA.id),
      }),
    ).rejects.toThrow(LastRemainingSlotError);

    // Reject when slot/event/cycle triple mismatches (slot belongs to a
    // different event than the one supplied).
    const otherEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Other day',
      startDate: new Date('2027-05-03T09:00:00.000Z'),
      endDate: new Date('2027-05-03T10:00:00.000Z'),
    });
    await expect(
      eventManager.updateSlot({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: otherEvent.id,
        slotId: TimeSlotId.from(slotA.id),
        label: 'Mismatched',
      }),
    ).rejects.toThrow('TimeSlot not found');

    // Reject on archived cycle.
    const archivedCycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Archived slot cycle',
      startDate: new Date('2000-01-01T00:00:00.000Z'),
      endDate: new Date('2000-02-01T00:00:00.000Z'),
    });
    await expect(
      eventManager.updateSlot({
        churchId: churchAId,
        cycleId: PlanningCycleId.from(archivedCycle.id),
        eventId: twoSlotEvent.id,
        slotId: TimeSlotId.from(slotA.id),
        label: 'Archived',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    // Reject when the cycle locks between load and mutation (re-fetched
    // fresh inside the same transaction, so a lock that lands before the
    // call is always observed).
    const raceEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: draftCycle.id,
      title: 'Race day',
      startDate: new Date('2027-05-04T09:00:00.000Z'),
      endDate: new Date('2027-05-04T10:00:00.000Z'),
    });
    const raceSlot = await seedEventSlot({
      churchId: seed.churchAId,
      eventId: raceEvent.id,
      startTime: new Date('2027-05-04T09:00:00.000Z'),
      endTime: new Date('2027-05-04T10:00:00.000Z'),
    });
    await cycleManager.lockCycle({
      churchId: churchAId,
      cycleId: draftCycle.id,
    });

    await expect(
      eventManager.updateSlot({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: raceEvent.id,
        slotId: TimeSlotId.from(raceSlot.id),
        label: 'Too late',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      eventManager.deleteSlot({
        churchId: churchAId,
        cycleId: draftCycle.id,
        eventId: raceEvent.id,
        slotId: TimeSlotId.from(raceSlot.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('updateEvent cascades a startDate change onto every child slot atomically, and leaves slots alone for non-date edits', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycleManager, eventManager, timeSlotRepository } = createManagers();
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
      startDate: new Date('2027-06-02T09:00:00.000Z'),
      endDate: new Date('2027-06-02T12:00:00.000Z'),
    });
    const [slotOne, slotTwo] = await Promise.all([
      seedEventSlot({
        churchId: seed.churchAId,
        eventId: cascadeEvent.id,
        startTime: new Date('2027-06-02T09:00:00.000Z'),
        endTime: new Date('2027-06-02T10:00:00.000Z'),
      }),
      seedEventSlot({
        churchId: seed.churchAId,
        eventId: cascadeEvent.id,
        startTime: new Date('2027-06-02T10:30:00.000Z'),
        endTime: new Date('2027-06-02T11:30:00.000Z'),
      }),
    ]);

    // Changing only title/endDate must NOT move any slot.
    await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: cascadeEvent.id,
      title: 'Cascade day (retitled)',
      endDate: new Date('2027-06-05T00:00:00.000Z'),
    });
    const slotsAfterNonDateEdit = await schedulingTestDb
      .select()
      .from(timeSlot)
      .where(eq(timeSlot.eventId, cascadeEvent.id));
    for (const slot of slotsAfterNonDateEdit) {
      const original = [slotOne, slotTwo].find((s) => s.id === slot.id);
      expect(slot.startTime.getTime()).toBe(original?.startTime.getTime());
      expect(slot.endTime.getTime()).toBe(original?.endTime.getTime());
    }

    // Changing startDate by 2 days + 3 hours must shift every slot by the
    // same delta, preserving each slot's own duration.
    const newStartDate = new Date('2027-06-04T12:00:00.000Z');
    const delta =
      newStartDate.getTime() - new Date('2027-06-02T09:00:00.000Z').getTime();

    await eventManager.updateEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      eventId: cascadeEvent.id,
      startDate: newStartDate,
    });

    const slotsAfterDateShift = await schedulingTestDb
      .select()
      .from(timeSlot)
      .where(eq(timeSlot.eventId, cascadeEvent.id));

    for (const original of [slotOne, slotTwo]) {
      const shifted = slotsAfterDateShift.find((s) => s.id === original.id);
      if (!shifted) throw new Error('expected slot to still exist');
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

    // Atomic rollback: if a slot in the cascade loop fails partway through,
    // the whole transaction — including the event's own startDate — must
    // roll back together, not leave a half-shifted day.
    const rollbackEvent = await eventManager.createEvent({
      churchId: churchAId,
      cycleId: cycle.id,
      title: 'Rollback day',
      startDate: new Date('2027-06-10T09:00:00.000Z'),
      endDate: new Date('2027-06-10T10:00:00.000Z'),
    });
    const survivingSlot = await seedEventSlot({
      churchId: seed.churchAId,
      eventId: rollbackEvent.id,
      startTime: new Date('2027-06-10T09:00:00.000Z'),
      endTime: new Date('2027-06-10T10:00:00.000Z'),
    });
    const failingSlot = await seedEventSlot({
      churchId: seed.churchAId,
      eventId: rollbackEvent.id,
      startTime: new Date('2027-06-10T10:00:00.000Z'),
      endTime: new Date('2027-06-10T11:00:00.000Z'),
    });

    const realUpdate = timeSlotRepository.update.bind(timeSlotRepository);
    const updateSpy = vi
      .spyOn(timeSlotRepository, 'update')
      .mockImplementation((slotChurchId, slotId, input, tx) => {
        if (slotId === failingSlot.id) {
          throw new Error('Simulated mid-cascade failure');
        }
        return realUpdate(slotChurchId, slotId, input, tx);
      });

    await expect(
      eventManager.updateEvent({
        churchId: churchAId,
        cycleId: cycle.id,
        eventId: EventId.from(rollbackEvent.id),
        startDate: new Date('2027-06-10T09:30:00.000Z'),
        endDate: new Date('2027-06-10T10:30:00.000Z'),
      }),
    ).rejects.toThrow('Simulated mid-cascade failure');

    updateSpy.mockRestore();

    const [rolledBackEvent] = await schedulingTestDb
      .select()
      .from(event)
      .where(eq(event.id, rollbackEvent.id));
    expect(rolledBackEvent?.startDate.getTime()).toBe(
      new Date('2027-06-10T09:00:00.000Z').getTime(),
    );
    expect(rolledBackEvent?.endDate.getTime()).toBe(
      new Date('2027-06-10T10:00:00.000Z').getTime(),
    );

    const [survivingSlotAfterRollback] = await schedulingTestDb
      .select()
      .from(timeSlot)
      .where(eq(timeSlot.id, survivingSlot.id));
    expect(survivingSlotAfterRollback?.startTime.getTime()).toBe(
      new Date('2027-06-10T09:00:00.000Z').getTime(),
    );
  });
});
