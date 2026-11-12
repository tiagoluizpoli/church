import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  assignment,
  assignmentAudit,
  availabilityCheck,
  church,
  ministryMembership,
  ministryParticipation,
  outboxMessage,
  shiftRequirement,
} from '@church/db';
import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
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
import {
  proposalReviewTokenFor,
  type ReviewedAddition,
} from '@/domain/services/assignment-proposal';
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
  reason: 'DUPLICATE_ASSIGNMENT',
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
  setTestClock({
    instant: parseInstant({ value: '2026-09-07T08:55:00.000Z' }),
  });
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
    adminUserId: seed.adminUserId,
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

describe('Assignment proposal preview', () => {
  interface SetScheduleStateInput {
    participationId: string;
    state: 'preparing' | 'availability_requested' | 'assigning' | 'published';
  }

  async function setScheduleState({
    participationId,
    state,
  }: SetScheduleStateInput) {
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state })
      .where(eq(ministryParticipation.id, participationId));
  }

  interface AskInput {
    churchId: string;
    cycleId: string;
    ministryId: string;
    membershipId: string;
    state: 'pending' | 'confirmed';
  }

  async function ask({ membershipId, ...input }: AskInput) {
    return buildAvailabilityCheck({
      db: schedulingTestDb,
      ...input,
      ministryMembershipId: membershipId,
    });
  }

  type ProposalSeed = Awaited<ReturnType<typeof seedCrossMinistryOverlap>>;

  async function propose(seed: ProposalSeed) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/assign/cycles/${seed.cycleId}/assignment-proposal?ministryId=${seed.ministryId}`,
    });
  }

  it('proposes from confirmed answers only, keeps existing Assignments, skips cross-Ministry overlaps and writes nothing', async () => {
    const seed = await seedCrossMinistryOverlap();
    await setScheduleState({
      participationId: seed.targetParticipationId,
      state: 'assigning',
    });
    const scope = {
      churchId: seed.churchId,
      cycleId: seed.cycleId,
      ministryId: seed.ministryId,
    };
    const memberships = await schedulingTestDb
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.ministryId, seed.ministryId));
    const membershipOf = (volunteerId: string) =>
      memberships.find((row) => row.volunteerId === volunteerId)?.id ?? '';
    await ask({
      ...scope,
      membershipId: membershipOf(seed.freeVolunteerId),
      state: 'confirmed',
    });
    await ask({
      ...scope,
      membershipId: membershipOf(seed.doubleBookedVolunteerId),
      state: 'confirmed',
    });
    const unanswered = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Unanswered',
      email: 'proposal-unanswered@test.com',
    });
    await seedRoleQualification({
      churchId: seed.churchId,
      membershipId: unanswered.membership.id,
      roleId: seed.targetRoleId,
    });
    await ask({
      ...scope,
      membershipId: unanswered.membership.id,
      state: 'pending',
    });
    const existing = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Already assigned',
      email: 'proposal-existing@test.com',
    });
    await seedTargetAssignment({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: existing.volunteer.id,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
    });
    const assignmentsBefore = await schedulingTestDb.select().from(assignment);

    const response = await propose(seed);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      additions: [
        {
          volunteerId: seed.freeVolunteerId,
          volunteerName: 'Free Volunteer',
          shiftRequirementId: seed.targetRequirementId,
          shiftId: seed.targetShiftId,
          reason: {
            eligibleShiftCount: 1,
            needCandidateCount: 1,
            decidedBy: 'only_candidate',
          },
        },
      ],
      gaps: [],
      excludedUnconfirmedCount: 1,
      emptyReason: null,
      reviewToken: proposalReviewTokenFor({
        cycleId: seed.cycleId,
        ministryId: seed.ministryId,
        additions: [
          {
            shiftRequirementId: seed.targetRequirementId,
            volunteerId: seed.freeVolunteerId,
          },
        ] as ReviewedAddition[],
      }),
    });
    // The overlap is used, never described.
    expect(response.body).not.toContain('Other ministry');
    expect(await schedulingTestDb.select().from(assignment)).toEqual(
      assignmentsBefore,
    );
    const [participation] = await schedulingTestDb
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, seed.targetParticipationId));
    expect(participation?.state).toBe('assigning');
  });

  it('explains an empty proposal when nobody has confirmed', async () => {
    const seed = await seedCrossMinistryOverlap();
    await setScheduleState({
      participationId: seed.targetParticipationId,
      state: 'availability_requested',
    });

    const response = await propose(seed);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      additions: [],
      gaps: [
        {
          shiftRequirementId: seed.targetRequirementId,
          shiftId: seed.targetShiftId,
          remaining: 2,
        },
      ],
      excludedUnconfirmedCount: 0,
      emptyReason: 'no_confirmed_responses',
      reviewToken: expect.any(String),
    });
  });

  it('is offered only between asking for availability and publishing', async () => {
    const seed = await seedCrossMinistryOverlap();

    const preparing = await propose(seed);
    expect(preparing.statusCode).toBe(409);
    expect(preparing.json().error).toBe('ILLEGAL_STATE_TRANSITION');

    await setScheduleState({
      participationId: seed.targetParticipationId,
      state: 'published',
    });
    const published = await propose(seed);
    expect(published.statusCode).toBe(409);
    expect(published.json().error).toBe('SCHEDULE_ALREADY_PUBLISHED');
  });

  it('requires manual-assignment authority and stays inside the active Church', async () => {
    const seed = await seedCrossMinistryOverlap();
    await setScheduleState({
      participationId: seed.targetParticipationId,
      state: 'assigning',
    });
    authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: false });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
    });
    expect((await propose(seed)).statusCode).toBe(403);

    authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/cycles/${seed.cycleId}/assignment-proposal?ministryId=${seed.foreignMinistryId}`,
    });
    expect(foreign.statusCode).toBe(404);
  });

  describe('apply', () => {
    interface ReviewedPair {
      shiftRequirementId: string;
      volunteerId: string;
    }

    interface PreviewBody {
      reviewToken: string;
      additions: ReviewedPair[];
    }

    /** Two confirmed, qualified Volunteers for the target need of two. */
    async function seedReviewedProposal() {
      const seed = await seedCrossMinistryOverlap();
      await setScheduleState({
        participationId: seed.targetParticipationId,
        state: 'availability_requested',
      });
      const scope = {
        churchId: seed.churchId,
        cycleId: seed.cycleId,
        ministryId: seed.ministryId,
      };
      const second = await seedVolunteerMembership({
        churchId: seed.churchId,
        ministryId: seed.ministryId,
        name: 'Second Volunteer',
        email: 'proposal-second@test.com',
      });
      await seedRoleQualification({
        churchId: seed.churchId,
        membershipId: second.membership.id,
        roleId: seed.targetRoleId,
      });
      const [free] = await schedulingTestDb
        .select()
        .from(ministryMembership)
        .where(eq(ministryMembership.volunteerId, seed.freeVolunteerId));
      await ask({ ...scope, membershipId: free?.id ?? '', state: 'confirmed' });
      const secondCheck = await ask({
        ...scope,
        membershipId: second.membership.id,
        state: 'confirmed',
      });
      const preview: PreviewBody = (await propose(seed)).json();
      return {
        ...seed,
        preview,
        secondCheckId: secondCheck.id,
        secondVolunteerId: second.volunteer.id,
      };
    }

    type ReviewedSeed = Awaited<ReturnType<typeof seedReviewedProposal>>;

    interface ReviewedBodyInput {
      preview: PreviewBody;
      applicationKey?: string;
    }

    function reviewedBody({
      preview,
      applicationKey = randomUUID(),
    }: ReviewedBodyInput) {
      return {
        applicationKey,
        reviewToken: preview.reviewToken,
        additions: preview.additions.map(
          ({ shiftRequirementId, volunteerId }) => ({
            shiftRequirementId,
            volunteerId,
          }),
        ),
      };
    }

    interface ApplyInput {
      seed: ReviewedSeed;
      body: ReturnType<typeof reviewedBody>;
    }

    async function apply({ seed, body }: ApplyInput) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/assign/cycles/${seed.cycleId}/assignment-proposal/apply?ministryId=${seed.ministryId}`,
        payload: body,
      });
    }

    async function targetAssignments(seed: ReviewedSeed) {
      return schedulingTestDb
        .select()
        .from(assignment)
        .where(eq(assignment.shiftId, seed.targetShiftId));
    }

    it('creates exactly the reviewed additions as pending Assignments, starts assigning, and neither publishes nor notifies', async () => {
      const seed = await seedReviewedProposal();
      const body = reviewedBody({ preview: seed.preview });
      expect(body.additions).toHaveLength(2);

      const response = await apply({ seed, body });

      expect(response.statusCode).toBe(200);
      const outcome = response.json();
      expect(outcome).toEqual({
        applicationKey: body.applicationKey,
        appliedAt: expect.any(String),
        replayed: false,
        additions: expect.arrayContaining(
          body.additions.map((pair) => ({
            ...pair,
            assignmentId: expect.any(String),
          })),
        ),
      });
      const rows = await targetAssignments(seed);
      expect(
        rows.map(({ id, volunteerId, status, assignedBy }) => ({
          id,
          volunteerId,
          status,
          assignedBy,
        })),
      ).toEqual(
        expect.arrayContaining(
          outcome.additions.map(
            ({
              assignmentId,
              volunteerId,
            }: {
              assignmentId: string;
              volunteerId: string;
            }) => ({
              id: assignmentId,
              volunteerId,
              status: 'pending',
              assignedBy: seed.adminUserId,
            }),
          ),
        ),
      );
      expect(rows).toHaveLength(2);
      const audits = await schedulingTestDb
        .select()
        .from(assignmentAudit)
        .where(eq(assignmentAudit.correlationId, body.applicationKey));
      expect(audits.map(({ action }) => action)).toEqual([
        'created',
        'created',
      ]);
      const [participation] = await schedulingTestDb
        .select()
        .from(ministryParticipation)
        .where(eq(ministryParticipation.id, seed.targetParticipationId));
      expect(participation?.state).toBe('assigning');
      expect(await schedulingTestDb.select().from(outboxMessage)).toEqual([]);
      const [overlap] = await schedulingTestDb
        .select()
        .from(assignment)
        .where(eq(assignment.id, seed.overlapId));
      expect(overlap?.status).toBe('confirmed');
    });

    it('recovers the committed outcome on a replay and after a lost response, even once published', async () => {
      const seed = await seedReviewedProposal();
      const body = reviewedBody({ preview: seed.preview });
      // The response of the committing attempt never reaches the client.
      const committed = (await apply({ seed, body })).json();

      const retry = await apply({ seed, body });
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual({ ...committed, replayed: true });

      await setScheduleState({
        participationId: seed.targetParticipationId,
        state: 'published',
      });
      const late = await apply({ seed, body });
      expect(late.statusCode).toBe(200);
      expect(late.json()).toEqual({ ...committed, replayed: true });
      expect(await targetAssignments(seed)).toHaveLength(2);
    });

    it('refuses altered or unreviewed pairs and a key reused for other pairs, writing nothing', async () => {
      const seed = await seedReviewedProposal();
      const body = reviewedBody({ preview: seed.preview });
      const [first] = body.additions;
      if (!first) throw new Error('Missing reviewed pair');

      const dropped = await apply({
        seed,
        body: { ...body, additions: [first] },
      });
      expect(dropped.statusCode).toBe(409);
      expect(dropped.json().error).toBe('ASSIGNMENT_PROPOSAL_CHANGED');
      const added = await apply({
        seed,
        body: {
          ...body,
          additions: [
            ...body.additions,
            {
              shiftRequirementId: seed.otherRequirementId,
              volunteerId: seed.doubleBookedVolunteerId,
            },
          ],
        },
      });
      expect(added.statusCode).toBe(409);
      expect(added.json().error).toBe('ASSIGNMENT_PROPOSAL_CHANGED');
      expect(await targetAssignments(seed)).toEqual([]);

      await apply({ seed, body });
      const replayAltered = await apply({
        seed,
        body: { ...body, additions: [first] },
      });
      expect(replayAltered.statusCode).toBe(409);
      expect(replayAltered.json().error).toBe('ASSIGNMENT_PROPOSAL_CHANGED');
      const reused = await apply({
        seed,
        body: {
          applicationKey: body.applicationKey,
          reviewToken: proposalReviewTokenFor({
            cycleId: seed.cycleId,
            ministryId: seed.ministryId,
            additions: [first] as ReviewedAddition[],
          }),
          additions: [first],
        },
      });
      expect(reused.statusCode).toBe(409);
      expect(reused.json().error).toBe('ASSIGNMENT_PROPOSAL_CHANGED');
      expect(await targetAssignments(seed)).toHaveLength(2);
    });

    const staleChanges: [string, (seed: ReviewedSeed) => Promise<unknown>][] = [
      [
        'a reviewed Volunteer withdraws availability',
        (seed) =>
          schedulingTestDb
            .update(availabilityCheck)
            .set({ state: 'pending' })
            .where(eq(availabilityCheck.id, seed.secondCheckId)),
      ],
      [
        'the requirement needs fewer people',
        (seed) =>
          schedulingTestDb
            .update(shiftRequirement)
            .set({ peopleNeeded: 1 })
            .where(eq(shiftRequirement.id, seed.targetRequirementId)),
      ],
      [
        'a manual Assignment takes a reviewed Volunteer',
        (seed) =>
          app.inject({
            method: 'POST',
            url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
            payload: {
              volunteerId: seed.secondVolunteerId,
              shiftRequirementId: seed.targetRequirementId,
            },
          }),
      ],
      [
        'the Shift starts',
        async () =>
          setTestClock({
            instant: parseInstant({ value: '2026-09-07T09:00:00.000Z' }),
          }),
      ],
    ];

    for (const [change, makeChange] of staleChanges) {
      it(`refuses a stale preview without partial writes when ${change}`, async () => {
        const seed = await seedReviewedProposal();
        await makeChange(seed);
        const before = await targetAssignments(seed);

        const response = await apply({
          seed,
          body: reviewedBody({ preview: seed.preview }),
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().error).toBe('ASSIGNMENT_PROPOSAL_STALE');
        expect(await targetAssignments(seed)).toEqual(before);
      });
    }

    it('keeps a preview valid across unrelated changes', async () => {
      const seed = await seedReviewedProposal();
      const late = await seedVolunteerMembership({
        churchId: seed.churchId,
        ministryId: seed.ministryId,
        name: 'Late Volunteer',
        email: 'proposal-late@test.com',
      });
      await seedRoleQualification({
        churchId: seed.churchId,
        membershipId: late.membership.id,
        roleId: seed.targetRoleId,
      });
      await ask({
        churchId: seed.churchId,
        cycleId: seed.cycleId,
        ministryId: seed.ministryId,
        membershipId: late.membership.id,
        state: 'confirmed',
      });
      await schedulingTestDb
        .update(shiftRequirement)
        .set({ peopleNeeded: 3 })
        .where(eq(shiftRequirement.id, seed.otherRequirementId));

      const response = await apply({
        seed,
        body: reviewedBody({ preview: seed.preview }),
      });

      expect(response.statusCode).toBe(200);
      expect(await targetAssignments(seed)).toHaveLength(2);
    });

    it('rechecks authority, lifecycle and the active Church on every apply', async () => {
      const seed = await seedReviewedProposal();
      const body = reviewedBody({ preview: seed.preview });

      authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: false });
      authorityGuard.decideManageAnyMinistry.mockResolvedValue({
        allowed: false,
      });
      expect((await apply({ seed, body })).statusCode).toBe(403);
      expect(await targetAssignments(seed)).toEqual([]);

      authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
      await setScheduleState({
        participationId: seed.targetParticipationId,
        state: 'published',
      });
      const published = await apply({ seed, body });
      expect(published.statusCode).toBe(409);
      expect(published.json().error).toBe('SCHEDULE_ALREADY_PUBLISHED');
      expect(await targetAssignments(seed)).toEqual([]);

      await setScheduleState({
        participationId: seed.targetParticipationId,
        state: 'assigning',
      });
      expect((await apply({ seed, body })).statusCode).toBe(200);
      activeChurchResolver.resolve.mockResolvedValue({
        status: 'resolved',
        churchId: seed.foreignChurchId,
        volunteerId: null,
        hasVolunteerMembership: false,
        autoSelected: false,
      });
      // Another Church neither finds the Schedule nor recovers the outcome.
      expect((await apply({ seed, body })).statusCode).toBe(404);
    });
  });
});

describe('late availability marks on the board', () => {
  it('flags an assignment when the mark was made afterwards', async () => {
    const seed = await seedCrossMinistryOverlap();
    const person = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Late mark',
      email: 'late-mark@test.com',
    });
    await buildAssignment({
      db: schedulingTestDb,
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: person.volunteer.id,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
      status: 'pending',
      assignedAt: parseInstant({ value: '2020-01-01T00:00:00.000Z' }),
    });
    const check = await buildAvailabilityCheck({
      db: schedulingTestDb,
      churchId: seed.churchId,
      cycleId: seed.cycleId,
      ministryMembershipId: person.membership.id,
      state: 'confirmed',
    });
    await buildUnavailableShift({
      db: schedulingTestDb,
      churchId: seed.churchId,
      availabilityCheckId: check.id,
      shiftId: seed.targetShiftId,
    });
    const assignmentsBefore = await schedulingTestDb.select().from(assignment);
    const outboxBefore = await schedulingTestDb.select().from(outboxMessage);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/cycles/${seed.cycleId}/builder?ministryId=${seed.ministryId}`,
    });
    expect(response.statusCode).toBe(200);
    const body: CycleBuilderResponse = response.json();
    const shifts = body.events.flatMap((event) =>
      event.eventTimeBlocks.flatMap((block) => block.shifts),
    );
    expect(
      shifts.find((row) => row.shift.id === seed.targetShiftId)?.assignments,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          volunteerId: person.volunteer.id,
          lateMark: true,
        }),
      ]),
    );
    expect(await schedulingTestDb.select().from(assignment)).toEqual(
      assignmentsBefore,
    );
    expect(await schedulingTestDb.select().from(outboxMessage)).toEqual(
      outboxBefore,
    );
  });
});

describe('Unavailable assignment', () => {
  it('returns an UNAVAILABLE warning when a marked volunteer is assigned', async () => {
    const seed = await seedCrossMinistryOverlap();
    const person = await seedVolunteerMembership({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Unavailable Volunteer',
      email: 'unavailable-create@test.com',
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
      state: 'confirmed',
    });
    await buildUnavailableShift({
      db: schedulingTestDb,
      churchId: seed.churchId,
      availabilityCheckId: check.id,
      shiftId: seed.targetShiftId,
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: person.volunteer.id,
        shiftRequirementId: seed.targetRequirementId,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'UNAVAILABLE' }),
      ]),
    );
    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/assign/cycles/${seed.cycleId}/builder?ministryId=${seed.ministryId}`,
    });
    expect(read.statusCode).toBe(200);
    const body: CycleBuilderResponse = read.json();
    const shift = body.events
      .flatMap((event) =>
        event.eventTimeBlocks.flatMap((block) => block.shifts),
      )
      .find((row) => row.shift.id === seed.targetShiftId);
    expect(shift?.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          volunteerId: person.volunteer.id,
          lateMark: false,
        }),
      ]),
    );
    expect(shift?.eligibleVolunteers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          volunteerId: person.volunteer.id,
          answerState: 'unavailable',
        }),
      ]),
    );
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

describe('move Assignment', () => {
  it('rebinds the same Assignment and records one updated audit', async () => {
    const seed = await seedCrossMinistryOverlap();
    const sector = await buildSector({
      db: schedulingTestDb,
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Side Door',
    });
    const target = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      roleId: seed.targetRoleId,
      sectorId: sector.id,
      peopleNeeded: 1,
    });
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
      url: `/api/v1/assign/assignments/${current.id}/move`,
      payload: { shiftRequirementId: target.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: current.id,
      shiftRequirementId: target.id,
    });
    const rows = await schedulingTestDb
      .select()
      .from(assignment)
      .where(eq(assignment.id, current.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shiftRequirementId).toBe(target.id);
    const audits = await schedulingTestDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, current.id));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'updated',
      actorId: seed.adminUserId,
    });
  });
  it('refuses another Shift or Role without changing the Assignment', async () => {
    const seed = await seedCrossMinistryOverlap();
    const current = await seedTargetAssignment({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: seed.freeVolunteerId,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
    });
    const otherShift = await seedShift({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      eventTimeBlockId: seed.targetBlockId,
      startTime: new Date('2026-09-07T10:00:00Z'),
      endTime: new Date('2026-09-07T11:00:00Z'),
      label: 'Later',
    });
    const otherRole = await seedRole({
      churchId: seed.churchId,
      ministryId: seed.ministryId,
      name: 'Other role',
    });
    const crossShift = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: otherShift.id,
      roleId: seed.targetRoleId,
      peopleNeeded: 1,
    });
    const crossRole = await seedRequirement({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      roleId: otherRole.id,
      peopleNeeded: 1,
    });
    for (const target of [crossShift, crossRole]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/assign/assignments/${current.id}/move`,
        payload: { shiftRequirementId: target.id },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: 'HARD_CONSTRAINT_VIOLATION',
      });
    }
    const [stored] = await schedulingTestDb
      .select()
      .from(assignment)
      .where(eq(assignment.id, current.id));
    expect(stored?.shiftRequirementId).toBe(seed.targetRequirementId);
    const audits = await schedulingTestDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, current.id));
    expect(audits).toHaveLength(0);
  });

  it('refuses a move when another active Assignment already exists for the Volunteer on the Shift', async () => {
    const seed = await seedCrossMinistryOverlap();
    const current = await buildAssignment({
      db: schedulingTestDb,
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: seed.freeVolunteerId,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
      status: 'declined',
    });
    await seedTargetAssignment({
      churchId: seed.churchId,
      participationId: seed.targetParticipationId,
      shiftId: seed.targetShiftId,
      volunteerId: seed.freeVolunteerId,
      roleId: seed.targetRoleId,
      shiftRequirementId: seed.targetRequirementId,
    });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assign/assignments/${current.id}/move`,
      payload: { shiftRequirementId: seed.targetRequirementId },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'HARD_CONSTRAINT_VIOLATION',
      message: m.error_hard_constraint_violation(),
      reason: 'DUPLICATE_ASSIGNMENT',
    });
    const audits = await schedulingTestDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, current.id));
    expect(audits).toHaveLength(0);
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
      url: `/api/v1/volunteer/ministries/${seed.ministryId}/schedule?cycleId=${seed.cycleId}`,
    });
    expect(published.statusCode).toBe(200);
    const rows = published.json().events[0].rows;
    // A declined place reads as Open; rows carry no confirmation state.
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).not.toHaveProperty('confirmationState');
    expect(
      rows.filter(
        (row: { sectorName: string; volunteerDisplayName?: string }) =>
          row.sectorName === 'Geral' && row.volunteerDisplayName,
      ),
    ).toHaveLength(2);
    expect(
      rows.filter(
        (row: { sectorName: string; volunteerDisplayName?: string }) =>
          row.sectorName === 'Side Door' && !row.volunteerDisplayName,
      ),
    ).toHaveLength(1);
    const sideRows = rows
      .map((row: { sectorName: string }) => row.sectorName)
      .join(',');
    expect(['Geral,Geral,Side Door', 'Side Door,Geral,Geral']).toContain(
      sideRows,
    );
  });
});

describe('started Shift assignments', () => {
  it('refuses a new Assignment exactly when the Shift starts', async () => {
    const seed = await seedCrossMinistryOverlap();
    setTestClock({
      instant: parseInstant({ value: '2026-09-07T09:00:00.000Z' }),
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
      payload: {
        volunteerId: seed.freeVolunteerId,
        shiftRequirementId: seed.targetRequirementId,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'SHIFT_STARTED' });
  });
});

for (const timezone of ['America/Sao_Paulo', 'America/New_York'] as const) {
  for (const state of ['assigning', 'published'] as const) {
    for (const mutation of ['create', 'move', 'reassign', 'remove'] as const) {
      for (const [clock, expected] of [
        [
          '2026-09-07T08:55:00.000Z',
          mutation === 'create' ? 201 : mutation === 'remove' ? 204 : 200,
        ],
        ['2026-09-07T09:00:00.000Z', 409],
        ['2026-09-07T10:30:00.000Z', 409],
      ] as const) {
        it(`${timezone} ${state}: ${mutation} at ${clock} returns ${expected}`, async () => {
          const seed = await seedCrossMinistryOverlap();
          await schedulingTestDb
            .update(church)
            .set({ timezone })
            .where(eq(church.id, seed.churchId));
          await schedulingTestDb
            .update(ministryParticipation)
            .set({ state })
            .where(eq(ministryParticipation.id, seed.targetParticipationId));
          const sector = await buildSector({
            db: schedulingTestDb,
            churchId: seed.churchId,
            ministryId: seed.ministryId,
            name: 'Side door',
          });
          const target = await seedRequirement({
            churchId: seed.churchId,
            participationId: seed.targetParticipationId,
            shiftId: seed.targetShiftId,
            roleId: seed.targetRoleId,
            sectorId: sector.id,
            peopleNeeded: 1,
          });
          const replacement = await seedVolunteerMembership({
            churchId: seed.churchId,
            ministryId: seed.ministryId,
            name: 'Replacement',
            email: 'replacement@test.com',
          });
          await seedRoleQualification({
            churchId: seed.churchId,
            membershipId: replacement.membership.id,
            roleId: seed.targetRoleId,
          });
          const current =
            mutation === 'create'
              ? undefined
              : await seedTargetAssignment({
                  churchId: seed.churchId,
                  participationId: seed.targetParticipationId,
                  shiftId: seed.targetShiftId,
                  volunteerId: seed.freeVolunteerId,
                  roleId: seed.targetRoleId,
                  shiftRequirementId: seed.targetRequirementId,
                });
          const checksBefore = await schedulingTestDb
            .select()
            .from(availabilityCheck);
          const outboxBefore = await schedulingTestDb
            .select()
            .from(outboxMessage);
          setTestClock({ instant: parseInstant({ value: clock }) });
          const response =
            mutation === 'create'
              ? await app.inject({
                  method: 'POST',
                  url: `/api/v1/assign/shifts/${seed.targetShiftId}/assignments`,
                  payload: {
                    volunteerId: seed.freeVolunteerId,
                    shiftRequirementId: seed.targetRequirementId,
                  },
                })
              : mutation === 'remove'
                ? await app.inject({
                    method: 'DELETE',
                    url: `/api/v1/assign/assignments/${current?.id}`,
                  })
                : await app.inject({
                    method: 'PATCH',
                    url: `/api/v1/assign/assignments/${current?.id}/${mutation}`,
                    payload:
                      mutation === 'move'
                        ? { shiftRequirementId: target.id }
                        : { volunteerId: replacement.volunteer.id },
                  });
          expect(response.statusCode).toBe(expected);
          if (expected === 409)
            expect(response.json()).toMatchObject({ error: 'SHIFT_STARTED' });
          expect(
            await schedulingTestDb.select().from(availabilityCheck),
          ).toEqual(checksBefore);
          expect(await schedulingTestDb.select().from(outboxMessage)).toEqual(
            outboxBefore,
          );
        });
      }
    }
  }
}
