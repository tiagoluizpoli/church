import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  assignment as assignmentTable,
  ministryParticipation,
  ministryVolunteer,
  role,
  shift as shiftTable,
  volunteer,
  volunteerNotification,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAuthorityManager } from '../../src/application/db-authority-manager';
import { DbAvailabilityCheckManager } from '../../src/application/db-availability-check-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TimeBlockId,
  TimeSlotId,
  UserId,
} from '../../src/domain/branded-ids';
import type { NotificationService } from '../../src/domain/contracts/infrastructure/notification-service';
import {
  CrossMinistryScopeError,
  IllegalStateTransitionError,
  InvalidRequiredCountError,
  InvalidShiftSplitError,
  ShiftOutOfBoundsError,
} from '../../src/domain/errors';
import { DrizzleAuthorityActorResolver } from '../../src/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '../../src/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleAvailabilityCheckRepository } from '../../src/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
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
  createSchedulingPhase3Template,
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
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db: schedulingTestDb,
  });
  const shiftRepository = new DrizzleShiftRepository({ db: schedulingTestDb });
  const eventRepository = new DrizzlePlanningEventRepository({
    db: schedulingTestDb,
  });
  const timeSlotRepository = new DrizzleTimeSlotRepository({
    db: schedulingTestDb,
  });
  const servingProfileRepository = new DrizzleMinistryServingProfileRepository({
    db: schedulingTestDb,
  });
  const availabilityCheckRepository = new DrizzleAvailabilityCheckRepository({
    db: schedulingTestDb,
  });
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  const notificationSpy = createNotificationServiceSpy();

  return {
    participationManager: new DbParticipationManager(
      participationRepository,
      shiftRepository,
      eventRepository,
      new DrizzleAssignmentRepository({ db: schedulingTestDb }),
      new DrizzleAvailabilityRepository({ db: schedulingTestDb }),
      timeSlotRepository,
      new DrizzleVolunteerRepository({ db: schedulingTestDb }),
      new DrizzleMinistryRepository({ db: schedulingTestDb }),
      servingProfileRepository,
      new DrizzleRoleRepository({ db: schedulingTestDb }),
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
      ministryAccessLevel: 'volunteer',
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

    // AuthorityManager scope: leader of ministryA cannot manage churchB participation
    const authorityManager = new DbAuthorityManager(
      new DrizzleAuthorityActorResolver({ db: schedulingTestDb }),
      new DrizzleSchedulingScopeResolver({ db: schedulingTestDb }),
      new DrizzleEventRepository({ db: schedulingTestDb }),
      new DrizzleTimeSlotRepository({ db: schedulingTestDb }),
    );
    await expect(
      authorityManager.canManageParticipation({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graphB.participation.id),
        userId: UserId.from(seed.adminUserId),
      }),
    ).resolves.toBe(false);
    await expect(
      authorityManager.canManageParticipation({
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

describe('Phase 4 participation manager — Iteration 3 touch()/listMinistryCycleSummaries', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('setInclusions/splitShifts/upsertRequirement each touch the participation exactly once, guarded against re-touching', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    const [beforeRow] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(and(eq(ministryParticipation.id, participation.id)));
    expect(beforeRow?.touchedAt).toBeNull();

    await participationManager.setInclusions({
      churchId,
      participationId,
      timeSlotIds: [TimeSlotId.from(slot.id)],
    });

    const [afterFirstTouch] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(and(eq(ministryParticipation.id, participation.id)));
    const firstTouchedAt = afterFirstTouch?.touchedAt;
    expect(firstTouchedAt).not.toBeNull();

    await participationManager.splitShifts({
      churchId,
      participationId,
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 2 },
    });

    const [afterSecondTouch] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(and(eq(ministryParticipation.id, participation.id)));
    expect(afterSecondTouch?.touchedAt).toEqual(firstTouchedAt);
  });

  it('listMinistryCycleSummaries delegates to the repository and includes zero-participation cycles', async () => {
    const seed = await seedSchedulingPhase3Base();
    await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Untouched Cycle',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'locked',
    });
    const { participationManager } = createPhase4Managers();

    const rows = await participationManager.listMinistryCycleSummaries({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Untouched Cycle',
      isPartOf: false,
      eventCount: 0,
      slotCount: 0,
      status: 'not_started',
      availabilityFiredForAll: false,
    });
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

    const participationRepo = new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    });
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
    const notificationRepository = new DrizzleVolunteerNotificationRepository({
      db: schedulingTestDb,
    });
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

async function seedRoleFor(input: { churchId: string; ministryId: string }) {
  const [row] = await schedulingTestDb
    .insert(role)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      ministryId: input.ministryId,
      name: 'Phase4 role',
    })
    .returning();
  if (!row) throw new Error('Phase 4 role seed failed');
  return row;
}

async function seedMembershipWithVolunteer(input: {
  churchId: string;
  ministryId: string;
}) {
  const userId = randomUUID();
  const volunteerId = randomUUID();
  await schedulingTestDb.insert((await import('@church/db')).user).values({
    id: userId,
    name: `Phase4 volunteer ${volunteerId}`,
    email: `${volunteerId}@test.com`,
    emailVerified: true,
  });
  const [volunteerRow] = await schedulingTestDb
    .insert(volunteer)
    .values({
      id: volunteerId,
      churchId: input.churchId,
      userId,
      status: 'active',
    })
    .returning();
  const [membership] = await schedulingTestDb
    .insert(ministryVolunteer)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      ministryId: input.ministryId,
      volunteerId,
      ministryAccessLevel: 'volunteer',
      status: 'active',
    })
    .returning();
  if (!volunteerRow || !membership) {
    throw new Error('Phase 4 volunteer membership seed failed');
  }
  return { volunteer: volunteerRow, membership };
}

describe('Phase 4 participation manager additional surfaces (shift lifecycle, serving profile, eligible-volunteer conflicts, publish edge states)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('updateShift adjusts bounds/label within tailoring, and is blocked once availability is fired', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    const [createdShift] = await participationManager.splitShifts({
      churchId,
      participationId,
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 1 },
    });
    if (!createdShift) throw new Error('split failed');

    const updated = await participationManager.updateShift({
      churchId,
      shiftId: ShiftId.from(createdShift.id),
      label: 'Relabeled shift',
    });
    expect(updated.label).toBe('Relabeled shift');
    expect(updated.startTime).toEqual(slot.startTime);

    const boundsOnlyUpdate = await participationManager.updateShift({
      churchId,
      shiftId: ShiftId.from(createdShift.id),
      startTime: slot.startTime,
    });
    expect(boundsOnlyUpdate.label).toBe('Relabeled shift');

    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'availability_fired' WHERE id = '${participation.id}'`,
    );

    await expect(
      participationManager.updateShift({
        churchId,
        shiftId: ShiftId.from(createdShift.id),
        label: 'Blocked relabel',
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('deleteShift removes a shift within tailoring, and is blocked once availability is fired', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, slot } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    const created = await participationManager.splitShifts({
      churchId,
      participationId,
      timeSlotId: TimeSlotId.from(slot.id),
      strategy: { kind: 'equal-n', n: 2 },
    });
    expect(created).toHaveLength(2);
    const [first, second] = created;
    if (!first || !second) throw new Error('split failed');

    await participationManager.deleteShift({
      churchId,
      shiftId: ShiftId.from(first.id),
    });
    const remaining = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.participationId, participation.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(second.id);

    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'availability_fired' WHERE id = '${participation.id}'`,
    );

    await expect(
      participationManager.deleteShift({
        churchId,
        shiftId: ShiftId.from(second.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('getServingProfile/upsertServingProfile persists validated entries and rejects invalid shift-split/headcount input', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const ministryId = MinistryId.from(seed.ministryAId);
    const roleRow = await seedRoleFor({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    const { blocks } = await createSchedulingPhase3Template({
      churchId: seed.churchAId,
      name: 'Profile template',
      weekday: 0,
      blocks: [
        {
          label: 'Welcome',
          startTime: '09:00:00',
          endTime: '09:30:00',
          order: 0,
        },
      ],
    });
    const block = blocks[0];
    if (!block) throw new Error('template block seed failed');

    const empty = await participationManager.getServingProfile({
      churchId,
      ministryId,
    });
    expect(empty).toEqual([]);

    const saved = await participationManager.upsertServingProfile({
      churchId,
      ministryId,
      entries: [
        {
          sourceTemplateBlockId: TimeBlockId.from(block.id),
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [{ roleId: RoleId.from(roleRow.id), count: 1 }],
        },
      ],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.serves).toBe(true);

    const fetched = await participationManager.getServingProfile({
      churchId,
      ministryId,
    });
    expect(fetched).toHaveLength(1);

    await expect(
      participationManager.upsertServingProfile({
        churchId,
        ministryId,
        entries: [
          {
            sourceTemplateBlockId: TimeBlockId.from(block.id),
            serves: true,
            shiftSplit: { kind: 'equal', count: 0 },
            headcounts: [],
          },
        ],
      }),
    ).rejects.toThrow(InvalidShiftSplitError);

    await expect(
      participationManager.upsertServingProfile({
        churchId,
        ministryId,
        entries: [
          {
            sourceTemplateBlockId: TimeBlockId.from(block.id),
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId: RoleId.from(roleRow.id), count: 0 }],
          },
        ],
      }),
    ).rejects.toThrow(InvalidRequiredCountError);
  });

  it('listEligibleVolunteers flags a volunteer with an overlapping active assignment as hasConflict (no per-shift requirement branch)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Eligible-conflict cycle',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });
    const targetGraph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Target event',
      startDate: new Date('2026-08-09T09:00:00.000Z'),
      endDate: new Date('2026-08-09T10:00:00.000Z'),
      status: 'scheduled',
    });
    const overlapGraph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Overlap event',
      startDate: new Date('2026-08-09T09:30:00.000Z'),
      endDate: new Date('2026-08-09T10:30:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRoleFor({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });

    const { participationManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const [targetShift] = await participationManager.splitShifts({
      churchId,
      participationId: MinistryParticipationId.from(
        targetGraph.participation.id,
      ),
      timeSlotId: TimeSlotId.from(targetGraph.slot.id),
      strategy: { kind: 'equal-n', n: 1 },
    });
    const [overlapShift] = await participationManager.splitShifts({
      churchId,
      participationId: MinistryParticipationId.from(
        overlapGraph.participation.id,
      ),
      timeSlotId: TimeSlotId.from(overlapGraph.slot.id),
      strategy: { kind: 'equal-n', n: 1 },
    });
    if (!targetShift || !overlapShift) throw new Error('split failed');

    const member = await seedMembershipWithVolunteer({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    await schedulingTestDb.insert(assignmentTable).values({
      id: randomUUID(),
      churchId: seed.churchAId,
      participationId: overlapGraph.participation.id,
      shiftId: overlapShift.id,
      volunteerId: member.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const eligible = await participationManager.listEligibleVolunteers({
      churchId,
      shiftId: ShiftId.from(targetShift.id),
    });

    const entry = eligible.find(
      (candidate) => candidate.volunteerId === member.volunteer.id,
    );
    expect(entry?.hasConflict).toBe(true);
  });

  it('publish() rejects while the participation is still tailoring (never fired/rostering)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation } = await seedCycleWithEvent({ seed });
    const { participationManager } = createPhase4Managers();

    await expect(
      participationManager.publish({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(participation.id),
      }),
    ).rejects.toThrow(IllegalStateTransitionError);
  });

  it('publish() succeeds with zero required headcount and sends no notifications', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation } = await seedCycleWithEvent({ seed });
    const { participationManager, notificationSpy } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    await schedulingTestDb.execute(
      `UPDATE ministry_participation SET state = 'rostering' WHERE id = '${participation.id}'`,
    );

    await participationManager.publish({ churchId, participationId });

    const row = await schedulingTestDb
      .select()
      .from((await import('@church/db')).ministryParticipation)
      .where(
        eq(
          (await import('@church/db')).ministryParticipation.id,
          participation.id,
        ),
      );
    expect(row[0]?.state).toBe('published');
    expect(notificationSpy.notifyVolunteer).not.toHaveBeenCalled();
  });
});

describe('Phase 4 availability check manager status listings (DL2-AF status surfaces)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('listCheckStatuses/listCycleCheckStatuses report per-membership state, distinguishing fired-and-pending, confirmed, and never-fired', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { participation, cycle } = await seedCycleWithEvent({ seed });
    const { availabilityManager } = createPhase4Managers();
    const churchId = ChurchId.from(seed.churchAId);
    const participationId = MinistryParticipationId.from(participation.id);

    // Base seed already made the admin volunteer a leader-membership of ministryA.
    // Add one more active member who never gets fired (proves the "no check yet" branch).
    await schedulingTestDb.insert((await import('@church/db')).user).values({
      id: 'phase4-status-user',
      name: 'Status User',
      email: 'phase4-status@test.com',
      emailVerified: true,
    });
    await seedMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      userId: 'phase4-status-user',
      volunteerId: '99999999-9999-4999-8999-999999999981',
    });

    const beforeFire = await availabilityManager.listCycleCheckStatuses({
      churchId,
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    expect(beforeFire).toHaveLength(2);
    expect(beforeFire.every((row) => row.state === undefined)).toBe(true);

    await availabilityManager.fireAvailability({ churchId, participationId });

    const viaParticipation = await availabilityManager.listCheckStatuses({
      churchId,
      participationId,
    });
    expect(viaParticipation).toHaveLength(2);
    expect(viaParticipation.every((row) => row.state === 'pending')).toBe(true);

    const adminRow = viaParticipation.find(
      (row) => row.volunteerId === seed.adminVolunteerId,
    );
    expect(adminRow?.confirmedAt).toBeUndefined();

    // Confirm one membership's check directly, then re-list and see the split state.
    const [checkRow] = await schedulingTestDb
      .select()
      .from((await import('@church/db')).availabilityCheck)
      .innerJoin(
        (await import('@church/db')).ministryVolunteer,
        eq(
          (await import('@church/db')).availabilityCheck.ministryVolunteerId,
          (await import('@church/db')).ministryVolunteer.id,
        ),
      )
      .where(
        eq(
          (await import('@church/db')).ministryVolunteer.volunteerId,
          seed.adminVolunteerId,
        ),
      );
    if (!checkRow)
      throw new Error('expected a fired check for the admin volunteer');
    await schedulingTestDb
      .update((await import('@church/db')).availabilityCheck)
      .set({ state: 'confirmed', confirmedAt: new Date() })
      .where(
        eq(
          (await import('@church/db')).availabilityCheck.id,
          checkRow.availability_check.id,
        ),
      );

    const afterConfirm = await availabilityManager.listCycleCheckStatuses({
      churchId,
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    const confirmedRow = afterConfirm.find(
      (row) => row.volunteerId === seed.adminVolunteerId,
    );
    const stillPendingRow = afterConfirm.find(
      (row) => row.volunteerId === '99999999-9999-4999-8999-999999999981',
    );
    expect(confirmedRow?.state).toBe('confirmed');
    expect(confirmedRow?.confirmedAt).toBeInstanceOf(Date);
    expect(stillPendingRow?.state).toBe('pending');
  });
});
