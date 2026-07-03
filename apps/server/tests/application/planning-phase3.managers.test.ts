import { beforeEach, describe, expect, it } from 'vitest';
import { DbEventTemplateManager } from '../../src/application/db-event-template-manager';
import { DbPlanningCycleManager } from '../../src/application/db-planning-cycle-manager';
import { DbPlanningEventManager } from '../../src/application/db-planning-event-manager';
import { ChurchId, PlanningCycleId } from '../../src/domain/branded-ids';
import {
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
  });
});
