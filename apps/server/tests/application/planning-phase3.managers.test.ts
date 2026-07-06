import { randomUUID } from 'node:crypto';
import {
  ministry,
  ministryServingProfile,
  participationSlotInclusion,
  role,
  shift as shiftTable,
  slotRequirement,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbEventTemplateManager } from '../../src/application/db-event-template-manager';
import { DbPlanningCycleManager } from '../../src/application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../src/application/db-planning-event-manager';
import { ChurchId, PlanningCycleId } from '../../src/domain/branded-ids';
import {
  EventOutsidePlanningCycleError,
  IllegalStateTransitionError,
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
  const churchRepository = new DrizzleChurchRepository(schedulingTestDb);
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
    ),
    templateManager: new DbEventTemplateManager(templateRepository),
  };
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
        isGlobal: false,
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
});
