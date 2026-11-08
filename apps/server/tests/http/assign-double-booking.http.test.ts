import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  assignment,
  assignmentAudit,
  ministryParticipation,
  shiftRequirement,
} from '@church/db';
import { m } from '@church/i18n/messages';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AssignController } from '@/api/controllers/assign-controller';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import type { CycleBuilderResponse } from '@/api/dtos/cycle-builder.dto';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import { buildMinistryMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = {
  decideManageAnyMinistry: vi.fn(),
  decideManageMinistry: vi.fn(),
  decideManageParticipation: vi.fn(),
  decideManageShift: vi.fn(),
};

const DOUBLE_BOOKED_REFUSAL = {
  error: 'HARD_CONSTRAINT_VIOLATION',
  message: m.error_hard_constraint_violation(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify({ locale: testLocale });
  const controller = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
    config: appConfig,
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
      const volunteerController = new VolunteerController({
        volunteerManager: managers.volunteerManager,
        activeChurchResolver: activeChurchResolver as never,
        config: appConfig,
      });
      instance.register(
        volunteerController.registerRoutes.bind(volunteerController),
        { prefix: volunteerController.prefix },
      );
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
});

interface SeedCrossMinistryOverlapInput {
  /** The Ministry B Shift; defaults to 09:30–10:30 against the 09:00–10:00 target. */
  otherShiftStart?: string;
  otherShiftEnd?: string;
}

/**
 * A Volunteer serving in Ministry A and Ministry B, already assigned in
 * Ministry B to a Shift that overlaps the Ministry A target Shift.
 */
async function seedCrossMinistryOverlap({
  otherShiftStart = '2026-09-07T09:30:00.000Z',
  otherShiftEnd = '2026-09-07T10:30:00.000Z',
}: SeedCrossMinistryOverlapInput = {}) {
  const seed = await seedSchedulingPhase3Base();
  mockGetSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: seed.churchAId,
    volunteerId: seed.adminVolunteerId,
    hasVolunteerMembership: true,
    autoSelected: false,
  });
  authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageParticipation.mockResolvedValue({ allowed: true });
  authorityGuard.decideManageShift.mockResolvedValue({ allowed: true });

  const otherMinistry = await buildMinistry({
    db: schedulingTestDb,
    id: randomUUID(),
    churchId: seed.churchAId,
    name: 'Other ministry',
  });
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    state: 'sent',
  });
  const target = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Target service',
    start: new Date('2026-09-07T09:00:00.000Z'),
    end: new Date('2026-09-07T11:00:00.000Z'),
    status: 'scheduled',
  });
  const other = await createSchedulingPhase3EventGraph({
    churchId: seed.churchAId,
    cycleId: cycle.id,
    ministryId: otherMinistry.id,
    title: 'Other ministry service',
    start: new Date('2026-09-07T08:00:00.000Z'),
    end: new Date('2026-09-07T12:00:00.000Z'),
    status: 'scheduled',
  });
  const targetRole = await seedRole({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Greeter',
  });
  const otherRole = await seedRole({
    churchId: seed.churchAId,
    ministryId: otherMinistry.id,
    name: 'Usher',
  });
  const targetShift = await seedShift({
    churchId: seed.churchAId,
    participationId: target.participation.id,
    eventTimeBlockId: target.eventTimeBlock.id,
    startTime: new Date('2026-09-07T09:00:00.000Z'),
    endTime: new Date('2026-09-07T10:00:00.000Z'),
    label: 'Target',
  });
  const otherShift = await seedShift({
    churchId: seed.churchAId,
    participationId: other.participation.id,
    eventTimeBlockId: other.eventTimeBlock.id,
    startTime: new Date(otherShiftStart),
    endTime: new Date(otherShiftEnd),
    label: 'Other',
  });
  const targetRequirement = await seedRequirement({
    churchId: seed.churchAId,
    participationId: target.participation.id,
    shiftId: targetShift.id,
    roleId: targetRole.id,
    peopleNeeded: 2,
  });

  const doubleBooked = await seedVolunteerMembership({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Double Booked',
    email: 'double-booked@test.com',
  });
  await seedRoleQualification({
    churchId: seed.churchAId,
    membershipId: doubleBooked.membership.id,
    roleId: targetRole.id,
  });
  await buildMinistryMembership({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    volunteerId: doubleBooked.volunteer.id,
    ministryId: otherMinistry.id,
    ministryAccessLevel: 'volunteer',
    roleIds: [otherRole.id],
    teams: [],
  });
  const otherRequirement = await seedRequirement({
    churchId: seed.churchAId,
    participationId: other.participation.id,
    shiftId: otherShift.id,
    roleId: otherRole.id,
    peopleNeeded: 1,
  });
  const overlap = await buildAssignment({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    participationId: other.participation.id,
    shiftId: otherShift.id,
    volunteerId: doubleBooked.volunteer.id,
    roleId: otherRole.id,
    shiftRequirementId: otherRequirement.id,
    status: 'confirmed',
  });

  const free = await seedVolunteerMembership({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Free Volunteer',
    email: 'free-volunteer@test.com',
  });
  await seedRoleQualification({
    churchId: seed.churchAId,
    membershipId: free.membership.id,
    roleId: targetRole.id,
  });

  return {
    cycleId: cycle.id,
    overlapId: overlap.id,
    churchId: seed.churchAId,
    foreignChurchId: seed.churchBId,
    foreignMinistryId: seed.ministryBId,
    ministryId: seed.ministryAId,
    targetBlockId: target.eventTimeBlock.id,
    otherRequirementId: otherRequirement.id,
    targetShiftId: targetShift.id,
    targetRequirementId: targetRequirement.id,
    targetParticipationId: target.participation.id,
    targetRoleId: targetRole.id,
    doubleBookedVolunteerId: doubleBooked.volunteer.id,
    freeVolunteerId: free.volunteer.id,
  };
}

interface SeedTargetAssignmentInput {
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  shiftRequirementId: string;
}

async function seedTargetAssignment(input: SeedTargetAssignmentInput) {
  return await buildAssignment({
    db: schedulingTestDb,
    ...input,
    status: 'pending',
  });
}

describe('builder eligibility contract', () => {
  it('returns the answer state and cross-Ministry overlap details', async () => {
    const seed = await seedCrossMinistryOverlap();
    for (const [name, state] of [
      ['Available', 'confirmed'],
      ['Unanswered', 'pending'],
      ['Unavailable', 'confirmed'],
    ] as const) {
      const person = await seedVolunteerMembership({
        churchId: seed.churchId,
        ministryId: seed.ministryId,
        name,
        email: `${name.toLowerCase()}@test.com`,
      });
      await seedRoleQualification({
        churchId: seed.churchId,
        membershipId: person.membership.id,
        roleId: seed.targetRoleId,
      });
      const check = await buildAvailabilityCheck({
        db: schedulingTestDb,
        churchId: seed.churchId,
        cycleId: seed.cycleId,
        ministryMembershipId: person.membership.id,
        state,
      });
      if (name !== 'Available')
        await buildUnavailableShift({
          db: schedulingTestDb,
          churchId: seed.churchId,
          availabilityCheckId: check.id,
          shiftId: seed.targetShiftId,
        });
    }
    const unqualified = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Unqualified',
      email: 'eligibility-unqualified@test.com',
    });
    const shiftResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/eligible-volunteers`,
    });
    expect(shiftResponse.statusCode).toBe(200);
    expect(
      shiftResponse
        .json()
        .volunteers.map(
          (person: { volunteerId: string }) => person.volunteerId,
        ),
    ).not.toContain(unqualified.volunteer.id);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/cycles/${seed.cycleId}/builder?ministryId=${seed.ministryId}`,
    });
    expect(response.statusCode).toBe(200);
    const body: CycleBuilderResponse = response.json();
    const shifts = body.events.flatMap((event) =>
      event.eventTimeBlocks.flatMap((block) => block.shifts),
    );
    const eligible =
      shifts.find((row) => row.shift.id === seed.targetShiftId)
        ?.eligibleVolunteers ?? [];
    expect(eligible.map((person) => person.volunteerName)).toEqual([
      'Available',
      'Unanswered',
      'Free Volunteer',
      'Double Booked',
      'Unavailable',
    ]);
    for (const person of eligible) {
      expect(person).not.toHaveProperty('isAvailable');
      expect(person).not.toHaveProperty('hasConflict');
    }
    expect(eligible.map((person) => person.answerState)).toEqual([
      'available',
      'unanswered',
      'not_asked',
      'not_asked',
      'unavailable',
    ]);
    expect(
      eligible.find(
        (person) => person.volunteerId === seed.doubleBookedVolunteerId,
      ),
    ).toMatchObject({
      answerState: 'not_asked',
      conflict: {
        assignmentId: seed.overlapId,
        ministryName: 'Other ministry',
        eventTitle: 'Other ministry service',
        startTime: '2026-09-07T09:30:00.000Z',
        endTime: '2026-09-07T10:30:00.000Z',
      },
    });
  });
});

describe('DOUBLE_BOOKED refusal across Ministries', () => {
  it('POST /assign/shifts/:id/assignments refuses a Volunteer with an overlapping Assignment in another Ministry', async () => {
    const seed = await seedCrossMinistryOverlap();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.doubleBookedVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(DOUBLE_BOOKED_REFUSAL);
  });

  it('POST /assign/shifts/:id/assignments refuses an overlapping Assignment that started earlier', async () => {
    const seed = await seedCrossMinistryOverlap({
      otherShiftStart: '2026-09-07T08:30:00.000Z',
      otherShiftEnd: '2026-09-07T09:30:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.doubleBookedVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(DOUBLE_BOOKED_REFUSAL);
  });

  it('POST /assign/shifts/:id/assignments accepts a back-to-back Shift in another Ministry', async () => {
    const seed = await seedCrossMinistryOverlap({
      otherShiftStart: '2026-09-07T10:00:00.000Z',
      otherShiftEnd: '2026-09-07T11:00:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.doubleBookedVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('POST /assign/shifts/:id/assignments still refuses when the old override reason is sent', async () => {
    const seed = await seedCrossMinistryOverlap();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.doubleBookedVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(DOUBLE_BOOKED_REFUSAL);
  });

  it('PATCH /assign/assignments/:id/reassign refuses moving to a Volunteer with an overlapping Assignment in another Ministry', async () => {
    const seed = await seedCrossMinistryOverlap();
    const current = await seedTargetAssignment({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: seed.freeVolunteerId,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${current.id}/reassign`,
      payload: { volunteerId: seed.doubleBookedVolunteerId },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(DOUBLE_BOOKED_REFUSAL);
    const retained = await schedulingTestDb
      .select()
      .from(assignment)
      .where(eq(assignment.id, current.id));
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({
      volunteerId: seed.freeVolunteerId,
      shiftRequirementId: seed.targetRequirementId,
    });
  });
});

describe('reassign without a reason input', () => {
  it('PATCH /assign/assignments/:id/reassign ignores a reason in the body and stores none', async () => {
    const seed = await seedCrossMinistryOverlap();
    const outgoing = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Outgoing Volunteer',
      email: 'outgoing@test.com',
    });
    const current = await seedTargetAssignment({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: outgoing.volunteer.id,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${current.id}/reassign`,
      payload: {
        volunteerId: seed.freeVolunteerId,
        reason: 'Swapping because of a schedule clash',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.volunteerId).toBe(seed.freeVolunteerId);
    expect(body.reason).toBeUndefined();

    const [stored] = await schedulingTestDb
      .select({ reason: assignment.reason })
      .from(assignment)
      .where(eq(assignment.id, body.id));
    expect(stored?.reason).toBeNull();

    const audits = await schedulingTestDb
      .select({
        action: assignmentAudit.action,
        reason: assignmentAudit.reason,
      })
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, body.id));
    expect(audits).toEqual(
      expect.arrayContaining([
        { action: 'created', reason: null },
        { action: 'updated', reason: null },
      ]),
    );
    expect(audits).toHaveLength(2);
  });
});

describe('requirement-bound Assignment HTTP contract', () => {
  it('refuses an unqualified member on create and reassign', async () => {
    const seed = await seedCrossMinistryOverlap();
    const unqualified = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Unqualified',
      email: 'refusal@test.com',
    });
    const refused = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: unqualified.volunteer.id,
        shiftRequirementId: seed.targetRequirementId,
      },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      error: 'HARD_CONSTRAINT_VIOLATION',
      reason: 'NOT_QUALIFIED',
    });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.freeVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });
    expect(created.statusCode).toBe(201);
    const reassigned = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${created.json().assignment.id}/reassign`,
      payload: { volunteerId: unqualified.volunteer.id },
    });
    expect(reassigned.statusCode).toBe(409);
    expect(reassigned.json()).toMatchObject({
      error: 'HARD_CONSTRAINT_VIOLATION',
      reason: 'NOT_QUALIFIED',
    });
  });

  it('derives the Role and scope, accepts a Role holder, and preserves the Sector on replacement', async () => {
    const seed = await seedCrossMinistryOverlap();
    const sector = await buildSector({
      db: schedulingTestDb,
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Side Door',
    });
    const requirement = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      roleId: seed.targetRoleId,
      sectorId: sector.id,
      peopleNeeded: 1,
    });
    const qualified = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Unqualified',
      email: 'requirement-warning@test.com',
    });
    await seedRoleQualification({
      churchId: seed.churchId,
      membershipId: qualified.membership.id,
      roleId: seed.targetRoleId,
    });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: qualified.volunteer.id,
        shiftRequirementId: requirement.id,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      assignment: {
        shiftRequirementId: requirement.id,
        shiftId: seed.targetShiftId,
        participationId: seed.targetParticipationId,
        roleId: seed.targetRoleId,
      },
      warnings: [],
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: qualified.volunteer.id,
        shiftRequirementId: seed.targetRequirementId,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    const replacement = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${created.json().assignment.id}/reassign`,
      payload: { volunteerId: seed.freeVolunteerId },
    });
    expect(replacement.statusCode).toBe(200);
    expect(replacement.json()).toMatchObject({
      volunteerId: seed.freeVolunteerId,
      shiftRequirementId: requirement.id,
      roleId: seed.targetRoleId,
      shiftId: seed.targetShiftId,
    });
    const stored = await schedulingTestDb
      .select()
      .from(assignment)
      .where(eq(assignment.shiftId, seed.targetShiftId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: replacement.json().id,
      shiftRequirementId: requirement.id,
      roleId: seed.targetRoleId,
    });
  });

  it('returns NOT_FOUND for a requirement of another Shift, Ministry, Church, or a missing requirement', async () => {
    const seed = await seedCrossMinistryOverlap();
    const otherShift = await seedShift({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      eventTimeBlockId: seed.targetBlockId,
      startTime: new Date('2026-09-07T10:00:00Z'),
      endTime: new Date('2026-09-07T11:00:00Z'),
      label: 'Later',
    });
    const otherRequirement = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: otherShift.id,
      roleId: seed.targetRoleId,
      peopleNeeded: 1,
    });
    const foreignCycle = await createSchedulingPhase3Cycle({
      churchId: seed.foreignChurchId,
      name: 'Foreign',
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-10-01T00:00:00Z'),
      state: 'sent',
    });
    const foreignGraph = await createSchedulingPhase3EventGraph({
      churchId: seed.foreignChurchId,
      cycleId: foreignCycle.id,
      ministryId: seed.foreignMinistryId,
      title: 'Foreign',
      start: new Date('2026-09-07T09:00:00Z'),
      end: new Date('2026-09-07T11:00:00Z'),
      status: 'scheduled',
    });
    const foreignRole = await seedRole({
      churchId: seed.foreignChurchId,
      ministryId: seed.foreignMinistryId,
      name: 'Foreign Role',
    });
    const foreignShift = await seedShift({
      churchId: seed.foreignChurchId,
      participationId: foreignGraph.participation.id,
      eventTimeBlockId: foreignGraph.eventTimeBlock.id,
      startTime: foreignGraph.eventTimeBlock.startTime,
      endTime: foreignGraph.eventTimeBlock.endTime,
      label: 'Foreign Shift',
    });
    const foreignRequirement = await seedRequirement({
      churchId: seed.foreignChurchId,
      participationId: foreignGraph.participation.id,
      shiftId: foreignShift.id,
      roleId: foreignRole.id,
      peopleNeeded: 1,
    });
    for (const shiftRequirementId of [
      otherRequirement.id,
      seed.otherRequirementId,
      foreignRequirement.id,
      randomUUID(),
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
        payload: { volunteerId: seed.freeVolunteerId, shiftRequirementId },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
    }
  });
});

describe('requirement coverage and published placement HTTP contract', () => {
  it('keeps an empty Sector open at 50% even when the other Sector has two active Assignments', async () => {
    const seed = await seedCrossMinistryOverlap();
    authorityGuard.decideManageParticipation.mockResolvedValue({
      allowed: true,
    });
    await schedulingTestDb
      .update(shiftRequirement)
      .set({ peopleNeeded: 1 })
      .where(eq(shiftRequirement.id, seed.targetRequirementId));
    const side = await buildSector({
      db: schedulingTestDb,
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Side Door',
    });
    const sideRequirement = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      roleId: seed.targetRoleId,
      sectorId: side.id,
      peopleNeeded: 1,
    });
    const extra = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Extra',
      email: 'coverage-extra@test.com',
    });
    for (const [volunteerId, requirementId, status] of [
      [seed.freeVolunteerId, sideRequirement.id, 'declined'],
      [seed.freeVolunteerId, seed.targetRequirementId, 'confirmed'],
      [extra.volunteer.id, seed.targetRequirementId, 'pending'],
      [extra.volunteer.id, sideRequirement.id, 'cancelled'],
    ] as const) {
      await buildAssignment({
        db: schedulingTestDb,
        churchId: seed.churchId,
        participationId: seed.targetParticipationId,
        shiftId: seed.targetShiftId,
        roleId: seed.targetRoleId,
        shiftRequirementId: requirementId,
        volunteerId,
        status,
      });
    }
    const completion = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/participations/${seed.targetParticipationId}/completion`,
    });
    expect(completion.statusCode).toBe(200);
    expect(completion.json()).toMatchObject({
      peopleNeeded: 2,
      assignedCount: 2,
      completionPercent: 50,
    });
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, seed.targetParticipationId));
    const published = await app.inject({
      method: 'GET',
      url: `/api/v1/volunteer/ministries/${seed.ministryId}/schedule`,
    });
    expect(published.statusCode).toBe(200);
    const rows = published.json().events[0].rows;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectorName: 'Geral',
          roleName: 'Greeter',
          confirmationState: 'confirmed',
        }),
        expect.objectContaining({
          sectorName: 'Geral',
          confirmationState: 'pending',
        }),
        expect.objectContaining({
          sectorName: 'Side Door',
          confirmationState: 'declined',
        }),
        expect.objectContaining({
          sectorName: 'Side Door',
          confirmationState: 'open',
        }),
      ]),
    );
    expect(rows).toHaveLength(4);
    const sideRows = rows
      .map((row: { sectorName: string }) => row.sectorName)
      .join(',');
    expect([
      'Geral,Geral,Side Door,Side Door',
      'Side Door,Side Door,Geral,Geral',
    ]).toContain(sideRows);
  });
});
