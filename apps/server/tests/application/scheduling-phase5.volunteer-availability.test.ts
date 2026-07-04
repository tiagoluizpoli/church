import {
  availabilityCheck as availabilityCheckTable,
  availability as availabilityTable,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  shift as shiftTable,
  user,
  volunteer,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbVolunteerManager } from '../../src/application/db-volunteer-manager';
import {
  AvailabilityCheckId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { AvailabilityOverlapError } from '../../src/domain/errors/availability-overlap';
import { CheckAccessDeniedError } from '../../src/domain/errors/check-access-denied';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleAvailabilityCheckRepository } from '../../src/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleTeamRepository } from '../../src/infrastructure/repositories/drizzle-team.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { SchedulingFeatureFlagServiceStub } from '../../src/test-support/feature-flag-service-stub';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  type SchedulingPhase3Seed,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';

interface Phase5Manager {
  volunteerManager: DbVolunteerManager;
  notificationSpy: ReturnType<typeof createNotificationServiceSpy>;
}

interface CreatePhase5ManagerInput {
  allowOverlapSave?: boolean;
}

function createPhase5Manager({
  allowOverlapSave,
}: CreatePhase5ManagerInput = {}): Phase5Manager {
  const notificationSpy = createNotificationServiceSpy();
  const volunteerManager = new DbVolunteerManager(
    new DrizzleVolunteerRepository(schedulingTestDb),
    new DrizzleAssignmentRepository(schedulingTestDb),
    new DrizzleAvailabilityRepository(schedulingTestDb),
    new DrizzleVolunteerNotificationRepository(schedulingTestDb),
    new DrizzleEventRepository(schedulingTestDb),
    new DrizzleTimeSlotRepository(schedulingTestDb),
    new DrizzleMinistryRepository(schedulingTestDb),
    new DrizzleRoleRepository(schedulingTestDb),
    new DrizzleTeamRepository(schedulingTestDb),
    new DrizzleAvailabilityCheckRepository(schedulingTestDb),
    new SchedulingFeatureFlagServiceStub({
      participationDefaultAllIn: true,
      volunteerDashboardAllowOverlapSave: allowOverlapSave ?? false,
    }),
    notificationSpy,
    new DrizzleUnitOfWork(schedulingTestDb),
  );

  return { volunteerManager, notificationSpy };
}

interface SeedVolunteerWithMembershipInput {
  churchId: string;
  ministryId: string;
  userId: string;
  volunteerId: string;
  email: string;
  systemRole?: 'volunteer' | 'leader';
}

async function seedVolunteerWithMembership(
  input: SeedVolunteerWithMembershipInput,
) {
  await schedulingTestDb
    .insert(user)
    .values({
      id: input.userId,
      name: `User ${input.userId}`,
      email: input.email,
      emailVerified: true,
    })
    .onConflictDoNothing();

  await schedulingTestDb
    .insert(volunteer)
    .values({
      id: input.volunteerId,
      churchId: input.churchId,
      userId: input.userId,
      status: 'active',
    })
    .onConflictDoNothing();

  const [membership] = await schedulingTestDb
    .insert(ministryVolunteer)
    .values({
      churchId: input.churchId,
      ministryId: input.ministryId,
      volunteerId: input.volunteerId,
      systemRole: input.systemRole ?? 'volunteer',
      status: 'active',
    })
    .returning();

  if (!membership) {
    throw new Error('Phase 5 membership seed failed');
  }

  return membership;
}

interface SeedShiftInput {
  churchId: string;
  participationId: string;
  timeSlotId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

async function seedShift(input: SeedShiftInput) {
  const [row] = await schedulingTestDb
    .insert(shiftTable)
    .values({
      churchId: input.churchId,
      participationId: input.participationId,
      timeSlotId: input.timeSlotId,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 5 shift seed failed');
  }

  return row;
}

interface SeedCheckInput {
  churchId: string;
  planningCycleId: string;
  ministryVolunteerId: string;
  state?: 'pending' | 'confirmed';
}

async function seedCheck(input: SeedCheckInput) {
  const [row] = await schedulingTestDb
    .insert(availabilityCheckTable)
    .values({
      churchId: input.churchId,
      planningCycleId: input.planningCycleId,
      ministryVolunteerId: input.ministryVolunteerId,
      state: input.state ?? 'pending',
    })
    .returning();

  if (!row) {
    throw new Error('Phase 5 availability check seed failed');
  }

  return row;
}

interface Phase5Fixture {
  seed: SchedulingPhase3Seed;
  cycleId: string;
  eventId: string;
  participationId: string;
  timeSlotId: string;
  shiftMorning: { id: string; startTime: Date; endTime: Date };
  shiftEvening: { id: string; startTime: Date; endTime: Date };
  volunteerId: string;
  membershipId: string;
  checkId: string;
}

const VOLUNTEER_USER_ID = 'phase5-volunteer-user';
const VOLUNTEER_ID = '55555555-5555-4555-8555-555555555551';

/** Seeds: locked cycle, one event (Aug 2), two shifts on it, one volunteer membership + pending check. */
async function seedPhase5Fixture(): Promise<Phase5Fixture> {
  const seed = await seedSchedulingPhase3Base();
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'August 2026',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    state: 'locked',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Sunday Service',
    startDate: new Date('2026-08-02T12:00:00.000Z'),
    endDate: new Date('2026-08-02T22:00:00.000Z'),
    status: 'scheduled',
  });

  const shiftMorning = await seedShift({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    timeSlotId: graph.slot.id,
    startTime: new Date('2026-08-02T12:00:00.000Z'),
    endTime: new Date('2026-08-02T15:00:00.000Z'),
    label: 'Morning',
  });
  const shiftEvening = await seedShift({
    churchId: seed.churchAId,
    participationId: graph.participation.id,
    timeSlotId: graph.slot.id,
    startTime: new Date('2026-08-02T18:00:00.000Z'),
    endTime: new Date('2026-08-02T22:00:00.000Z'),
    label: 'Evening',
  });

  const membership = await seedVolunteerWithMembership({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    userId: VOLUNTEER_USER_ID,
    volunteerId: VOLUNTEER_ID,
    email: 'phase5-volunteer@test.com',
  });
  const check = await seedCheck({
    churchId: seed.churchAId,
    planningCycleId: cycle.id,
    ministryVolunteerId: membership.id,
  });

  return {
    seed,
    cycleId: cycle.id,
    eventId: graph.event.id,
    participationId: graph.participation.id,
    timeSlotId: graph.slot.id,
    shiftMorning,
    shiftEvening,
    volunteerId: VOLUNTEER_ID,
    membershipId: membership.id,
    checkId: check.id,
  };
}

interface SecondMinistryFixture {
  ministryId: string;
  participationId: string;
  membershipId: string;
  checkId: string;
  leaderVolunteerId: string;
}

interface SeedSecondMinistryInput {
  fixture: Phase5Fixture;
  overlapping: boolean;
}

/** Second ministry in church A sharing the cycle; the same volunteer joins it, with its own check + shift. */
async function seedSecondMinistryBranch({
  fixture,
  overlapping,
}: SeedSecondMinistryInput): Promise<SecondMinistryFixture> {
  const [secondMinistry] = await schedulingTestDb
    .insert(ministry)
    .values({
      churchId: fixture.seed.churchAId,
      name: 'Scheduling Ministry A2',
    })
    .returning();
  if (!secondMinistry) {
    throw new Error('Phase 5 second ministry seed failed');
  }

  const leaderVolunteerId = '55555555-5555-4555-8555-555555555552';
  await seedVolunteerWithMembership({
    churchId: fixture.seed.churchAId,
    ministryId: secondMinistry.id,
    userId: 'phase5-leader-user',
    volunteerId: leaderVolunteerId,
    email: 'phase5-leader@test.com',
    systemRole: 'leader',
  });

  const [secondParticipation] = await schedulingTestDb
    .insert(ministryParticipation)
    .values({
      churchId: fixture.seed.churchAId,
      ministryId: secondMinistry.id,
      eventId: fixture.eventId,
    })
    .returning();
  if (!secondParticipation) {
    throw new Error('Phase 5 second participation seed failed');
  }

  // Overlapping: intersects the Morning shift (12:00-15:00). Otherwise disjoint (15:00-17:00 touches edges only).
  await seedShift({
    churchId: fixture.seed.churchAId,
    participationId: secondParticipation.id,
    timeSlotId: fixture.timeSlotId,
    startTime: overlapping
      ? new Date('2026-08-02T14:00:00.000Z')
      : new Date('2026-08-02T15:00:00.000Z'),
    endTime: overlapping
      ? new Date('2026-08-02T16:00:00.000Z')
      : new Date('2026-08-02T17:00:00.000Z'),
    label: 'Second ministry shift',
  });

  const membership = await seedVolunteerWithMembership({
    churchId: fixture.seed.churchAId,
    ministryId: secondMinistry.id,
    userId: VOLUNTEER_USER_ID,
    volunteerId: fixture.volunteerId,
    email: 'phase5-volunteer@test.com',
  });
  const check = await seedCheck({
    churchId: fixture.seed.churchAId,
    planningCycleId: fixture.cycleId,
    ministryVolunteerId: membership.id,
  });

  return {
    ministryId: secondMinistry.id,
    participationId: secondParticipation.id,
    membershipId: membership.id,
    checkId: check.id,
    leaderVolunteerId,
  };
}

async function listMarks(checkId: string) {
  return schedulingTestDb
    .select()
    .from(availabilityTable)
    .where(eq(availabilityTable.availabilityCheckId, checkId));
}

describe('Phase 5 volunteer availability (DL2-VA)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('DL2-VA-01 setUnavailability writes only the marked shifts; unmarked remain available', async () => {
    const fixture = await seedPhase5Fixture();
    const { volunteerManager } = createPhase5Manager();

    const detail = await volunteerManager.setUnavailability({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
      shiftIds: [ShiftId.from(fixture.shiftEvening.id)],
    });

    const marks = await listMarks(fixture.checkId);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.shiftId).toBe(fixture.shiftEvening.id);

    const morning = detail.shifts.find(
      (shift) => shift.shiftId === fixture.shiftMorning.id,
    );
    const evening = detail.shifts.find(
      (shift) => shift.shiftId === fixture.shiftEvening.id,
    );
    expect(morning?.available).toBe(true);
    expect(evening?.available).toBe(false);
  });

  it('DL2-VA-02 whole-day marks every shift on that church-local date', async () => {
    const fixture = await seedPhase5Fixture();
    const { volunteerManager } = createPhase5Manager();

    await volunteerManager.setUnavailability({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
      shiftIds: [],
      wholeDayDates: ['2026-08-02'],
    });

    const marks = await listMarks(fixture.checkId);
    const markedShiftIds = marks.map((mark) => mark.shiftId).sort();
    expect(markedShiftIds).toEqual(
      [fixture.shiftMorning.id, fixture.shiftEvening.id].sort(),
    );
  });

  it('DL2-VA-03 confirm with zero marks transitions to confirmed and sets confirmedAt', async () => {
    const fixture = await seedPhase5Fixture();
    const { volunteerManager } = createPhase5Manager();

    const result = await volunteerManager.confirmAvailabilityCheck({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
    });

    expect(result.state).toBe('confirmed');
    expect(result.overlaps).toEqual([]);

    const [row] = await schedulingTestDb
      .select()
      .from(availabilityCheckTable)
      .where(eq(availabilityCheckTable.id, fixture.checkId));
    expect(row?.state).toBe('confirmed');
    expect(row?.confirmedAt).toBeInstanceOf(Date);
  });

  it('DL2-VA-04 a volunteer cannot mark or confirm another volunteer’s check', async () => {
    const fixture = await seedPhase5Fixture();
    const { volunteerManager } = createPhase5Manager();
    const intruderId = VolunteerId.from('55555555-5555-4555-8555-555555555559');

    await seedVolunteerWithMembership({
      churchId: fixture.seed.churchAId,
      ministryId: fixture.seed.ministryAId,
      userId: 'phase5-intruder-user',
      volunteerId: intruderId,
      email: 'phase5-intruder@test.com',
    });

    await expect(
      volunteerManager.setUnavailability({
        checkId: AvailabilityCheckId.from(fixture.checkId),
        volunteerId: intruderId,
        churchId: ChurchId.from(fixture.seed.churchAId),
        shiftIds: [ShiftId.from(fixture.shiftMorning.id)],
      }),
    ).rejects.toThrow(CheckAccessDeniedError);

    await expect(
      volunteerManager.confirmAvailabilityCheck({
        checkId: AvailabilityCheckId.from(fixture.checkId),
        volunteerId: intruderId,
        churchId: ChurchId.from(fixture.seed.churchAId),
      }),
    ).rejects.toThrow(CheckAccessDeniedError);
  });

  it('DL2-VA-05 cross-ministry overlap with ALLOW_OVERLAP_SAVE=false blocks the confirm', async () => {
    const fixture = await seedPhase5Fixture();
    await seedSecondMinistryBranch({ fixture, overlapping: true });
    const { volunteerManager } = createPhase5Manager({
      allowOverlapSave: false,
    });

    await expect(
      volunteerManager.confirmAvailabilityCheck({
        checkId: AvailabilityCheckId.from(fixture.checkId),
        volunteerId: VolunteerId.from(fixture.volunteerId),
        churchId: ChurchId.from(fixture.seed.churchAId),
      }),
    ).rejects.toThrow(AvailabilityOverlapError);

    const [row] = await schedulingTestDb
      .select()
      .from(availabilityCheckTable)
      .where(eq(availabilityCheckTable.id, fixture.checkId));
    expect(row?.state).toBe('pending');
  });

  it('DL2-VA-06 same overlap with flag ON confirms and flags the conflict to affected leaders', async () => {
    const fixture = await seedPhase5Fixture();
    const branch = await seedSecondMinistryBranch({
      fixture,
      overlapping: true,
    });
    const { volunteerManager, notificationSpy } = createPhase5Manager({
      allowOverlapSave: true,
    });

    const result = await volunteerManager.confirmAvailabilityCheck({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
    });

    expect(result.state).toBe('confirmed');
    expect(result.overlaps.length).toBeGreaterThan(0);

    const conflictCalls = notificationSpy.notifyVolunteer.mock.calls.filter(
      ([input]) => input.type === 'availability_conflict',
    );
    expect(conflictCalls.length).toBeGreaterThan(0);
    const notifiedVolunteerIds = conflictCalls.map(
      ([input]) => input.volunteerId,
    );
    expect(notifiedVolunteerIds).toContain(branch.leaderVolunteerId);
  });

  it('DL2-VA-07 non-overlapping availability across ministries confirms cleanly', async () => {
    const fixture = await seedPhase5Fixture();
    await seedSecondMinistryBranch({ fixture, overlapping: false });
    const { volunteerManager, notificationSpy } = createPhase5Manager({
      allowOverlapSave: false,
    });

    const result = await volunteerManager.confirmAvailabilityCheck({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
    });

    expect(result.state).toBe('confirmed');
    expect(result.overlaps).toEqual([]);
    expect(notificationSpy.notifyVolunteer).not.toHaveBeenCalled();
  });

  it('lists checks and resolves detail with available-by-default shifts', async () => {
    const fixture = await seedPhase5Fixture();
    const { volunteerManager } = createPhase5Manager();

    const summaries = await volunteerManager.listAvailabilityChecks({
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(fixture.checkId);
    expect(summaries[0]?.state).toBe('pending');
    expect(summaries[0]?.totalShiftCount).toBe(2);
    expect(summaries[0]?.unavailableShiftCount).toBe(0);

    const detail = await volunteerManager.getAvailabilityCheck({
      checkId: AvailabilityCheckId.from(fixture.checkId),
      volunteerId: VolunteerId.from(fixture.volunteerId),
      churchId: ChurchId.from(fixture.seed.churchAId),
    });
    expect(detail.shifts).toHaveLength(2);
    expect(detail.shifts.every((shift) => shift.available)).toBe(true);
  });
});
