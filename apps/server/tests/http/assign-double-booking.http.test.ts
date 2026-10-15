import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import { assignment, assignmentAudit } from '@church/db';
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
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
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

vi.mock('@church/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@church/auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = {
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageMinistry: vi.fn(),
  canManageTeam: vi.fn(),
  canManageTeamShift: vi.fn(),
};

const DOUBLE_BOOKED_REFUSAL = {
  error: 'HARD_CONSTRAINT_VIOLATION',
  message: 'Volunteer is already assigned to another overlapping shift',
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify();
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
    autoSelected: false,
  });
  authorityGuard.canManageShift.mockResolvedValue(true);
  authorityGuard.canManageTeamShift.mockResolvedValue(false);

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
    eventTimeBlockId: target.slot.id,
    startTime: new Date('2026-09-07T09:00:00.000Z'),
    endTime: new Date('2026-09-07T10:00:00.000Z'),
    label: 'Target',
  });
  const otherShift = await seedShift({
    churchId: seed.churchAId,
    participationId: other.participation.id,
    eventTimeBlockId: other.slot.id,
    startTime: new Date(otherShiftStart),
    endTime: new Date(otherShiftEnd),
    label: 'Other',
  });
  await seedRequirement({
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
  await buildAssignment({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    participationId: other.participation.id,
    shiftId: otherShift.id,
    volunteerId: doubleBooked.volunteer.id,
    roleId: otherRole.id,
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
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    targetShiftId: targetShift.id,
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
}

async function seedTargetAssignment(input: SeedTargetAssignmentInput) {
  return await buildAssignment({
    db: schedulingTestDb,
    ...input,
    status: 'pending',
  });
}

describe('DOUBLE_BOOKED refusal across Ministries', () => {
  it('POST /assign/shifts/:id/assignments refuses a Volunteer with an overlapping Assignment in another Ministry', async () => {
    const seed = await seedCrossMinistryOverlap();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.doubleBookedVolunteerId,
        roleId: seed.targetRoleId,
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
        roleId: seed.targetRoleId,
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
        roleId: seed.targetRoleId,
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
        roleId: seed.targetRoleId,
        override: { reason: 'Leader approved the overlap' },
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
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${current.id}/reassign`,
      payload: { volunteerId: seed.doubleBookedVolunteerId },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(DOUBLE_BOOKED_REFUSAL);
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
