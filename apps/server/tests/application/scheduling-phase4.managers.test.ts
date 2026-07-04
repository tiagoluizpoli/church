import {
  ministryVolunteer,
  role,
  shift as shiftTable,
  volunteer,
  volunteerNotification,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAvailabilityCheckManager } from '../../src/application/db-availability-check-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import { DbSchedulingRbacManager } from '../../src/application/db-scheduling-rbac-manager';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TimeSlotId,
  UserId,
} from '../../src/domain/branded-ids';
import type { NotificationService } from '../../src/domain/contracts/infrastructure/notification-service';
import {
  CrossMinistryScopeError,
  IllegalStateTransitionError,
  InvalidRequiredCountError,
  ShiftOutOfBoundsError,
} from '../../src/domain/errors';
import { DrizzleSchedulingRbacResolver } from '../../src/infrastructure/auth/drizzle-scheduling-rbac-resolver';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleAvailabilityCheckRepository } from '../../src/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '../../src/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { LocalNotificationService } from '../../src/infrastructure/services/local-notification-service';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  type SchedulingPhase3Seed,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';

interface Phase4Managers {
  participationManager: DbParticipationManager;
  availabilityManager: DbAvailabilityCheckManager;
  notificationSpy: ReturnType<typeof createNotificationServiceSpy>;
}

function createPhase4Managers(
  notificationService?: NotificationService,
): Phase4Managers {
  const participationRepository = new DrizzleMinistryParticipationRepository(
    schedulingTestDb,
  );
  const shiftRepository = new DrizzleShiftRepository(schedulingTestDb);
  const eventRepository = new DrizzlePlanningEventRepository(schedulingTestDb);
  const timeSlotRepository = new DrizzleTimeSlotRepository(schedulingTestDb);
  const servingProfileRepository = new DrizzleMinistryServingProfileRepository(
    schedulingTestDb,
  );
  const availabilityCheckRepository = new DrizzleAvailabilityCheckRepository(
    schedulingTestDb,
  );
  const unitOfWork = new DrizzleUnitOfWork(schedulingTestDb);
  const notificationSpy = createNotificationServiceSpy();

  return {
    participationManager: new DbParticipationManager(
      participationRepository,
      shiftRepository,
      eventRepository,
      new DrizzleAssignmentRepository(schedulingTestDb),
      new DrizzleAvailabilityRepository(schedulingTestDb),
      timeSlotRepository,
      new DrizzleVolunteerRepository(schedulingTestDb),
      new DrizzleMinistryRepository(schedulingTestDb),
      servingProfileRepository,
      notificationService ?? notificationSpy,
      unitOfWork,
    ),
    availabilityManager: new DbAvailabilityCheckManager(
      participationRepository,
      eventRepository,
      availabilityCheckRepository,
      notificationService ?? notificationSpy,
      unitOfWork,
    ),
    notificationSpy,
  };
}

interface SeedCycleGraphInput {
  seed: SchedulingPhase3Seed;
  ministryId?: string;
  churchId?: string;
  state?: 'draft' | 'locked' | 'archived';
}

async function seedCycleWithEvent({
  seed,
  ministryId,
  churchId,
  state,
}: SeedCycleGraphInput) {
  const targetChurchId = churchId ?? seed.churchAId;
  const cycle = await createSchedulingPhase3Cycle({
    churchId: targetChurchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    state: state ?? 'locked',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: targetChurchId,
    cycleId: cycle.id,
    ministryId: ministryId ?? seed.ministryAId,
    title: 'Sunday Service',
    startDate: new Date('2026-08-02T12:00:00.000Z'),
    endDate: new Date('2026-08-02T15:00:00.000Z'),
    status: 'scheduled',
  });

  return { cycle, ...graph };
}

interface SeedMembershipInput {
  churchId: string;
  ministryId: string;
  userId: string;
  volunteerId: string;
  status?: 'active' | 'inactive';
}

async function seedMembership(input: SeedMembershipInput) {
  const [volunteerRow] = await schedulingTestDb
    .insert(volunteer)
    .values({
      id: input.volunteerId,
      churchId: input.churchId,
      userId: input.userId,
      status: 'active',
    })
    .onConflictDoNothing()
    .returning();

  const [membership] = await schedulingTestDb
    .insert(ministryVolunteer)
    .values({
      churchId: input.churchId,
      ministryId: input.ministryId,
      volunteerId: input.volunteerId,
      systemRole: 'volunteer',
      status: input.status ?? 'active',
    })
    .returning();

  if (!membership) {
    throw new Error('Phase 4 membership seed failed');
  }

  return { volunteerRow, membership };
}

describe('Phase 4 participation manager (DL2-PT)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('DL2-PT-01 lazily creates the participation with seeded view data', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle, event } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();

    // remove the pre-seeded participation to prove lazy creation
    await schedulingTestDb.execute(
      `DELETE FROM ministry_participation WHERE event_id = '${event.id}'`,
    );

    const view = await participationManager.getCycleParticipation({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    expect(view.events).toHaveLength(1);
    expect(view.events[0]?.participation.state).toBe('tailoring');
    expect(view.events[0]?.slots).toHaveLength(1);
    expect(view.events[0]?.slots[0]?.included).toBe(false);

    // second call reuses the lazily created participation
    const again = await participationManager.getCycleParticipation({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    expect(again.events[0]?.participation.id).toBe(
      view.events[0]?.participation.id,
    );
  });

  it('DL2-PT-02 setInclusions opts slots in (default whole-slot shift) and out', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    await participationManager.setInclusions({
      churchId,
      participationId,
      timeSlotIds: [TimeSlotId.from(slot.id)],
    });

    const shiftsAfterInclude = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participation.id));
    expect(shiftsAfterInclude).toHaveLength(1);
    expect(shiftsAfterInclude[0]?.startTime).toEqual(slot.startTime);
    expect(shiftsAfterInclude[0]?.endTime).toEqual(slot.endTime);

    await participationManager.setInclusions({
      churchId,
      participationId,
      timeSlotIds: [],
    });

    const shiftsAfterExclude = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participation.id));
    expect(shiftsAfterExclude).toHaveLength(0);
  });

  it('DL2-PT-03 splitShifts equal-N persists N shifts within bounds', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();

    const created = await participationManager.splitShifts({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(participation.id),
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 3 },
    });

    expect(created).toHaveLength(3);
    expect(created[0]?.startTime).toEqual(slot.startTime);
    expect(created[2]?.endTime).toEqual(slot.endTime);
  });

  it('DL2-PT-04 manual out-of-bounds split is rejected with a conflict error', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();

    await expect(
      participationManager.splitShifts({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(participation.id),
        timeSlotId: TimeSlotId.from(slot.id),
        strategy: {
          kind: 'manual',
          spans: [
            {
              startTime: new Date('2026-08-02T11:00:00.000Z'),
              endTime: new Date('2026-08-02T16:00:00.000Z'),
            },
          ],
        },
      }),
    ).rejects.toThrow(ShiftOutOfBoundsError);

    const shifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participation.id));
    expect(shifts).toHaveLength(0);
  });

  it('DL2-PT-05 upserts per-shift requirements and rejects counts below one', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);

    const [roleRow] = await schedulingTestDb
      .insert(role)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Usher',
      })
      .returning();
    if (!roleRow) throw new Error('role seed failed');

    const [shiftEntity] = await participationManager.splitShifts({
      churchId,
      participationId: MinistryParticipationId.from(participation.id),
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 1 },
    });
    if (!shiftEntity) throw new Error('split failed');

    const created = await participationManager.upsertRequirement({
      churchId,
      shiftId: ShiftId.from(shiftEntity.id),
      roleId: RoleId.from(roleRow.id),
      requiredCount: 2,
    });
    expect(created.requiredCount).toBe(2);

    const updated = await participationManager.upsertRequirement({
      churchId,
      shiftId: ShiftId.from(shiftEntity.id),
      roleId: RoleId.from(roleRow.id),
      requiredCount: 4,
    });
    expect(updated.requiredCount).toBe(4);
    expect(updated.id).toBe(created.id);

    await expect(
      participationManager.upsertRequirement({
        churchId,
        shiftId: ShiftId.from(shiftEntity.id),
        roleId: RoleId.from(roleRow.id),
        requiredCount: 0,
      }),
    ).rejects.toThrow(InvalidRequiredCountError);
  });

  it('DL2-PT-06 cross-ministry and cross-church scope is denied', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graphA = await seedCycleWithEvent({ seed });
    const graphB = await seedCycleWithEvent({
      seed,
      churchId: seed.churchBId,
      ministryId: seed.ministryBId,
    });
    const { participationManager } = createPhase4Managers();

    // churchA scope cannot touch churchB's participation
    await expect(
      participationManager.setInclusions({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graphB.participation.id),
        timeSlotIds: [],
      }),
    ).rejects.toThrow();

    // RBAC manager scope: leader of ministryA cannot manage churchB participation
    const rbac = new DbSchedulingRbacManager(
      new DrizzleSchedulingRbacResolver(schedulingTestDb),
    );
    await expect(
      rbac.canManageParticipation({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graphB.participation.id),
        userId: UserId.from(seed.adminUserId),
      }),
    ).resolves.toBe(false);
    await expect(
      rbac.canManageParticipation({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graphA.participation.id),
        userId: UserId.from(seed.adminUserId),
      }),
    ).resolves.toBe(true);
  });

  it('DL2-PT-07 two ministries split the same slot independently', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot, event } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);

    // second ministry in church A participating in the same event
    const [ministryC] = await schedulingTestDb
      .insert((await import('@church/db')).ministry)
      .values({
        churchId: seed.churchAId,
        name: 'Scheduling Ministry C',
      })
      .returning();
    if (!ministryC) throw new Error('ministry seed failed');
    const [participationC] = await schedulingTestDb
      .insert((await import('@church/db')).ministryParticipation)
      .values({
        churchId: seed.churchAId,
        ministryId: ministryC.id,
        eventId: event.id,
      })
      .returning();
    if (!participationC) throw new Error('participation seed failed');

    await participationManager.splitShifts({
      churchId,
      participationId: MinistryParticipationId.from(participation.id),
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 2 },
    });
    await participationManager.splitShifts({
      churchId,
      participationId: MinistryParticipationId.from(participationC.id),
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 3 },
    });

    const shiftsA = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participation.id));
    const shiftsC = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participationC.id));

    expect(shiftsA).toHaveLength(2);
    expect(shiftsC).toHaveLength(3);
  });

  it('DL2-PT-08 shift mutations are blocked once availability is fired', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);

    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'availability_fired' WHERE id = '${participation.id}'`,
    );

    await expect(
      participationManager.splitShifts({
        churchId,
        participationId: MinistryParticipationId.from(participation.id),
        timeSlotId: TimeSlotId.from(slot.id),
        strategy: { kind: 'equal-n', n: 2 },
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
    await expect(
      participationManager.setInclusions({
        churchId,
        participationId: MinistryParticipationId.from(participation.id),
        timeSlotIds: [],
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('rejects splitting a slot that belongs to another event', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph1 = await seedCycleWithEvent({ seed });
    const seedB = graph1;
    const otherGraph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: seedB.cycle.id,
      ministryId: seed.ministryAId,
      title: 'Second Event',
      startDate: new Date('2026-08-09T12:00:00.000Z'),
      endDate: new Date('2026-08-09T15:00:00.000Z'),
      status: 'scheduled',
    });
    const { participationManager } = createPhase4Managers();

    await expect(
      participationManager.splitShifts({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graph1.participation.id),
        timeSlotId: TimeSlotId.from(otherGraph.slot.id),
        strategy: { kind: 'equal-n', n: 2 },
      }),
    ).rejects.toThrow(CrossMinistryScopeError);
  });
});

describe('Phase 4 availability check manager (DL2-AF)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('DL2-AF-01/02/03 fire creates one check per active membership and notifies each once', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, cycle } = await seedCycleWithEvent({ seed });
    const { availabilityManager, notificationSpy } = createPhase4Managers();

    await schedulingTestDb.insert((await import('@church/db')).user).values([
      {
        id: 'vol-user-1',
        name: 'Vol 1',
        email: 'v1@test.com',
        emailVerified: true,
      },
      {
        id: 'vol-user-2',
        name: 'Vol 2',
        email: 'v2@test.com',
        emailVerified: true,
      },
      {
        id: 'vol-user-3',
        name: 'Vol 3',
        email: 'v3@test.com',
        emailVerified: true,
      },
    ]);
    await seedMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      userId: 'vol-user-1',
      volunteerId: '99999999-9999-4999-8999-999999999991',
    });
    await seedMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      userId: 'vol-user-2',
      volunteerId: '99999999-9999-4999-8999-999999999992',
    });
    await seedMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      userId: 'vol-user-3',
      volunteerId: '99999999-9999-4999-8999-999999999993',
      status: 'inactive',
    });

    const result = await availabilityManager.fireAvailability({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(participation.id),
    });

    // admin leader membership (from base seed) + two active volunteers; inactive excluded
    expect(result.createdCheckCount).toBe(3);
    expect(notificationSpy.notifyVolunteer).toHaveBeenCalledTimes(3);
    const notified = notificationSpy.notifyVolunteer.mock.calls.map(
      ([event]) => event,
    );
    for (const event of notified) {
      expect(event.type).toBe('availability_reminder');
      expect(event.planningCycleId).toBe(cycle.id);
    }
    expect(
      notified.some(
        (event) => event.volunteerId === '99999999-9999-4999-8999-999999999993',
      ),
    ).toBe(false);
  });

  it('DL2-AF-04/05 fire flips state transactionally and never duplicates checks across events of the same cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph1 = await seedCycleWithEvent({ seed });
    const graph2 = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: graph1.cycle.id,
      ministryId: seed.ministryAId,
      title: 'Second Sunday',
      startDate: new Date('2026-08-09T12:00:00.000Z'),
      endDate: new Date('2026-08-09T15:00:00.000Z'),
      status: 'scheduled',
    });
    const { availabilityManager, notificationSpy } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);

    const first = await availabilityManager.fireAvailability({
      churchId,
      participationId: MinistryParticipationId.from(graph1.participation.id),
    });
    expect(first.createdCheckCount).toBe(1);

    const participationRepo = new DrizzleMinistryParticipationRepository(
      schedulingTestDb,
    );
    const updated = await participationRepo.getById({
      churchId,
      participationId: MinistryParticipationId.from(graph1.participation.id),
    });
    expect(updated.state).toBe('availability_fired');

    // firing again on the SAME participation is an illegal transition
    await expect(
      availabilityManager.fireAvailability({
        churchId,
        participationId: MinistryParticipationId.from(graph1.participation.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);

    // firing a second event's participation in the same cycle creates no duplicate checks
    notificationSpy.notifyVolunteer.mockClear();
    const second = await availabilityManager.fireAvailability({
      churchId,
      participationId: MinistryParticipationId.from(graph2.participation.id),
    });
    expect(second.createdCheckCount).toBe(0);
    expect(notificationSpy.notifyVolunteer).not.toHaveBeenCalled();
  });

  it('DL2-AF-06 resendReminder re-notifies pending checks without creating new ones', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation } = await seedCycleWithEvent({ seed });
    const { availabilityManager, notificationSpy } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    await expect(
      availabilityManager.resendReminder({ churchId, participationId }),
    ).rejects.toThrow(IllegalStateTransitionError);

    await availabilityManager.fireAvailability({ churchId, participationId });
    notificationSpy.notifyVolunteer.mockClear();

    await availabilityManager.resendReminder({ churchId, participationId });

    expect(notificationSpy.notifyVolunteer).toHaveBeenCalledTimes(1);
    const checks = await schedulingTestDb
      .select()
      .from((await import('@church/db')).availabilityCheck);
    expect(checks).toHaveLength(1);
  });

  it('DL2-AF-07 checks and fire scope are church-isolated', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graphB = await seedCycleWithEvent({
      seed,
      churchId: seed.churchBId,
      ministryId: seed.ministryBId,
    });
    const { availabilityManager } = createPhase4Managers();

    await expect(
      availabilityManager.fireAvailability({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graphB.participation.id),
      }),
    ).rejects.toThrow();
  });

  it('DL2-AF-08 fired notifications persist with the planning cycle scope', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, cycle } = await seedCycleWithEvent({ seed });
    const notificationRepository = new DrizzleVolunteerNotificationRepository(
      schedulingTestDb,
    );
    const { availabilityManager } = createPhase4Managers(
      new LocalNotificationService(notificationRepository),
    );

    await availabilityManager.fireAvailability({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(participation.id),
    });

    const rows = await schedulingTestDb
      .select()
      .from(volunteerNotification)
      .where(
        and(
          eq(volunteerNotification.churchId, seed.churchAId),
          eq(volunteerNotification.type, 'availability_reminder'),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.planningCycleId).toBe(cycle.id);
  });
});
