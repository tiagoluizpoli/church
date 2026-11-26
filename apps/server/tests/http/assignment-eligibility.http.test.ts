import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  assignment,
  assignmentAudit,
  event,
  eventTimeBlock,
  ministryMembership,
  ministryMembershipRole,
  ministryParticipation,
  shiftRequirement,
  swapRequest,
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
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

/**
 * Characterization of every Assignment eligibility refusal and its precedence
 * (#1122), per entry point: each case makes two refusals true at once and pins
 * which one answers, and that a refusal writes nothing.
 */

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

const BEFORE_START = '2026-09-07T08:55:00.000Z';
const AT_START = '2026-09-07T09:00:00.000Z';

const refusal = {
  shiftStarted: { error: 'SHIFT_STARTED', message: m.error_shift_started() },
  eventCancelled: {
    error: 'EVENT_CANCELLED',
    message: m.error_event_cancelled(),
  },
  blockCancelled: {
    error: 'EVENT_TIME_BLOCK_CANCELLED',
    message: m.error_event_time_block_cancelled(),
  },
  // The response names only NOT_QUALIFIED and DUPLICATE_ASSIGNMENT reasons.
  notInMinistry: {
    error: 'HARD_CONSTRAINT_VIOLATION',
    message: m.error_hard_constraint_violation(),
  },
  notQualified: {
    error: 'HARD_CONSTRAINT_VIOLATION',
    reason: 'NOT_QUALIFIED',
    message: m.error_hard_constraint_violation(),
  },
  duplicate: {
    error: 'HARD_CONSTRAINT_VIOLATION',
    reason: 'DUPLICATE_ASSIGNMENT',
    message: m.error_hard_constraint_violation(),
  },
  invalidMoveTarget: {
    error: 'HARD_CONSTRAINT_VIOLATION',
    message: m.error_hard_constraint_violation(),
  },
  full: {
    error: 'SHIFT_REQUIREMENT_FULL',
    message: m.error_shift_requirement_full(),
  },
} as const;

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new AssignController({
    ...managers.participationModules,
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
  setTestClock({ instant: parseInstant({ value: BEFORE_START }) });
});

/**
 * Ministry A's Schedule (availability requested) with a 09:00–10:00 target
 * Shift holding two Greeter needs (Front ×1, held; Back ×1, open) and a
 * 10:00–11:00 later Shift; Ministry B has a 09:30–10:30 Shift. Every
 * Volunteer below is asked and confirmed for the Cycle.
 */
async function seedSchedule() {
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
  for (const decide of Object.values(authorityGuard))
    decide.mockResolvedValue({ allowed: true });

  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const otherMinistry = await buildMinistry({
    db,
    id: randomUUID(),
    churchId,
    name: 'Other ministry',
  });
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September 2026',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    state: 'sent',
  });
  const target = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Target service',
    start: new Date('2026-09-07T09:00:00.000Z'),
    end: new Date('2026-09-07T11:00:00.000Z'),
    status: 'scheduled',
  });
  await db
    .update(ministryParticipation)
    .set({ state: 'availability_requested' })
    .where(eq(ministryParticipation.id, target.participation.id));
  const other = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId: otherMinistry.id,
    title: 'Other ministry service',
    start: new Date('2026-09-07T08:00:00.000Z'),
    end: new Date('2026-09-07T12:00:00.000Z'),
    status: 'scheduled',
  });
  const greeter = await seedRole({ churchId, ministryId, name: 'Greeter' });
  const usher = await seedRole({
    churchId,
    ministryId: otherMinistry.id,
    name: 'Usher',
  });
  const shift = await seedShift({
    churchId,
    participationId: target.participation.id,
    eventTimeBlockId: target.eventTimeBlock.id,
    startTime: new Date('2026-09-07T09:00:00.000Z'),
    endTime: new Date('2026-09-07T10:00:00.000Z'),
    label: 'Target',
  });
  const laterShift = await seedShift({
    churchId,
    participationId: target.participation.id,
    eventTimeBlockId: target.eventTimeBlock.id,
    startTime: new Date('2026-09-07T10:00:00.000Z'),
    endTime: new Date('2026-09-07T11:00:00.000Z'),
    label: 'Later',
  });
  const otherShift = await seedShift({
    churchId,
    participationId: other.participation.id,
    eventTimeBlockId: other.eventTimeBlock.id,
    startTime: new Date('2026-09-07T09:30:00.000Z'),
    endTime: new Date('2026-09-07T10:30:00.000Z'),
    label: 'Other',
  });
  const back = await buildSector({ db, churchId, ministryId, name: 'Back' });
  const front = await seedRequirement({
    churchId,
    participationId: target.participation.id,
    shiftId: shift.id,
    roleId: greeter.id,
    peopleNeeded: 1,
  });
  const backNeed = await seedRequirement({
    churchId,
    participationId: target.participation.id,
    shiftId: shift.id,
    roleId: greeter.id,
    peopleNeeded: 1,
    sectorId: back.id,
  });
  const laterNeed = await seedRequirement({
    churchId,
    participationId: target.participation.id,
    shiftId: laterShift.id,
    roleId: greeter.id,
    peopleNeeded: 1,
  });
  const otherNeed = await seedRequirement({
    churchId,
    participationId: other.participation.id,
    shiftId: otherShift.id,
    roleId: usher.id,
    peopleNeeded: 3,
  });

  interface MemberInput {
    name: string;
    qualified: boolean;
    asked?: boolean;
  }
  const member = async ({ name, qualified, asked = true }: MemberInput) => {
    const created = await seedVolunteerMembership({
      churchId,
      ministryId,
      name,
      email: `${name.toLowerCase()}@test.com`,
    });
    if (qualified)
      await seedRoleQualification({
        churchId,
        membershipId: created.membership.id,
        roleId: greeter.id,
      });
    const check = asked
      ? await buildAvailabilityCheck({
          db,
          churchId,
          cycleId: cycle.id,
          ministryMembershipId: created.membership.id,
          state: 'confirmed',
        })
      : undefined;
    return {
      volunteerId: created.volunteer.id,
      userId: created.volunteer.userId,
      membershipId: created.membership.id,
      checkId: check?.id ?? '',
    };
  };
  const holder = await member({ name: 'Holder', qualified: true });
  const free = await member({ name: 'Free', qualified: true });
  const unqualified = await member({ name: 'Unqualified', qualified: false });
  const unasked = await member({
    name: 'Unasked',
    qualified: true,
    asked: false,
  });
  const outsider = await seedVolunteerMembership({
    churchId,
    ministryId: otherMinistry.id,
    name: 'Outsider',
    email: 'outsider@test.com',
  });
  const held = await buildAssignment({
    db,
    churchId,
    participationId: target.participation.id,
    shiftId: shift.id,
    volunteerId: holder.volunteerId,
    roleId: greeter.id,
    shiftRequirementId: front.id,
    status: 'pending',
  });

  interface PlaceInput {
    volunteerId: string;
    on: 'front' | 'back' | 'later' | 'other';
  }
  /** Seeds an existing active Assignment straight into the table. */
  const place = async ({ volunteerId, on }: PlaceInput) => {
    if (on === 'other') {
      await buildMinistryMembership({
        db,
        churchId,
        volunteerId,
        ministryId: otherMinistry.id,
        ministryAccessLevel: 'volunteer',
        roleIds: [usher.id],
      });
      return buildAssignment({
        db,
        churchId,
        participationId: other.participation.id,
        shiftId: otherShift.id,
        volunteerId,
        roleId: usher.id,
        shiftRequirementId: otherNeed.id,
        status: 'pending',
      });
    }
    const need = { front, back: backNeed, later: laterNeed }[on];
    return buildAssignment({
      db,
      churchId,
      participationId: target.participation.id,
      shiftId: need.shiftId as string,
      volunteerId,
      roleId: greeter.id,
      shiftRequirementId: need.id,
      status: 'pending',
    });
  };
  const markUnavailable = (volunteer: { checkId: string }) =>
    buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: volunteer.checkId,
      shiftId: shift.id,
    });
  const cancelEvent = () =>
    db
      .update(event)
      .set({ status: 'cancelled' })
      .where(eq(event.id, target.event.id));
  const cancelBlock = () =>
    db
      .update(eventTimeBlock)
      .set({ status: 'cancelled' })
      .where(eq(eventTimeBlock.id, target.eventTimeBlock.id));
  const setState = (
    state: 'preparing' | 'availability_requested' | 'assigning' | 'published',
  ) =>
    db
      .update(ministryParticipation)
      .set({ state })
      .where(eq(ministryParticipation.id, target.participation.id));
  const openSwapRequest = async () => {
    const [row] = await db
      .insert(swapRequest)
      .values({
        churchId,
        assignmentId: held.id,
        status: 'open',
        raisedBy: holder.userId,
      })
      .returning();
    return row as NonNullable<typeof row>;
  };

  return {
    adminUserId: seed.adminUserId,
    churchId,
    ministryId,
    cycleId: cycle.id,
    participationId: target.participation.id,
    shift,
    laterShift,
    front,
    backNeed,
    laterNeed,
    otherNeed,
    holder,
    free,
    unqualified,
    unasked,
    outsiderId: outsider.volunteer.id,
    held,
    place,
    markUnavailable,
    cancelEvent,
    cancelBlock,
    setState,
    openSwapRequest,
  };
}

type Schedule = Awaited<ReturnType<typeof seedSchedule>>;

const startShift = () =>
  setTestClock({ instant: parseInstant({ value: AT_START }) });

/** Every Assignment and audit row, to prove a refusal wrote nothing. */
async function writes() {
  const rows = await db
    .select({
      id: assignment.id,
      volunteerId: assignment.volunteerId,
      shiftRequirementId: assignment.shiftRequirementId,
      status: assignment.status,
    })
    .from(assignment);
  const audits = await db.select().from(assignmentAudit);
  const states = await db
    .select({
      id: ministryParticipation.id,
      state: ministryParticipation.state,
    })
    .from(ministryParticipation);
  const sort = <T extends { id: string }>(list: T[]) =>
    [...list].sort((left, right) => left.id.localeCompare(right.id));
  return {
    rows: sort(rows),
    audits: sort(audits),
    states: sort(states),
  };
}

interface CreateInput {
  schedule: Schedule;
  volunteerId: string;
  shiftRequirementId?: string;
}

function create({
  schedule,
  volunteerId,
  shiftRequirementId = schedule.backNeed.id,
}: CreateInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/assign/shifts/${schedule.shift.id}/assignments`,
    payload: { volunteerId, shiftRequirementId },
  });
}

interface ReassignInput {
  schedule: Schedule;
  volunteerId: string;
}

function reassign({ schedule, volunteerId }: ReassignInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/assign/assignments/${schedule.held.id}/reassign`,
    payload: { volunteerId },
  });
}

interface MoveInput {
  schedule: Schedule;
  shiftRequirementId: string;
}

function move({ schedule, shiftRequirementId }: MoveInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/assign/assignments/${schedule.held.id}/move`,
    payload: { shiftRequirementId },
  });
}

interface RefusedCase {
  name: string;
  arrange: (schedule: Schedule) => Promise<unknown>;
  act: (schedule: Schedule) => ReturnType<typeof create>;
  status: number;
  body: object;
}

function pinRefusals(cases: RefusedCase[]) {
  for (const { name, arrange, act, status, body } of cases) {
    it(name, async () => {
      const schedule = await seedSchedule();
      await arrange(schedule);
      const before = await writes();

      const response = await act(schedule);

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(body);
      expect(await writes()).toEqual(before);
    });
  }
}

describe('manual assign refusal precedence', () => {
  pinRefusals([
    {
      name: 'a started Shift outranks a cancelled Event',
      arrange: async (schedule) => {
        await schedule.cancelEvent();
        startShift();
      },
      act: (schedule) =>
        create({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.shiftStarted,
    },
    {
      name: 'a cancelled Event outranks its cancelled time block',
      arrange: async (schedule) => {
        await schedule.cancelEvent();
        await schedule.cancelBlock();
      },
      act: (schedule) =>
        create({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.eventCancelled,
    },
    {
      name: 'a cancelled time block outranks a requirement of another Shift',
      arrange: (schedule) => schedule.cancelBlock(),
      act: (schedule) =>
        create({
          schedule,
          volunteerId: schedule.free.volunteerId,
          shiftRequirementId: schedule.laterNeed.id,
        }),
      status: 409,
      body: refusal.blockCancelled,
    },
    {
      name: 'a requirement of another Shift is not found before membership is checked',
      arrange: async () => undefined,
      act: (schedule) =>
        create({
          schedule,
          volunteerId: schedule.outsiderId,
          shiftRequirementId: schedule.laterNeed.id,
        }),
      status: 404,
      body: { error: 'NOT_FOUND', message: m.error_not_found() },
    },
    {
      name: 'a non-member is refused as not in the Ministry, not as unqualified',
      arrange: async () => undefined,
      act: (schedule) => create({ schedule, volunteerId: schedule.outsiderId }),
      status: 409,
      body: refusal.notInMinistry,
    },
    {
      name: 'a missing Role outranks an Assignment already on the Shift',
      arrange: (schedule) =>
        schedule.place({
          volunteerId: schedule.unqualified.volunteerId,
          on: 'front',
        }),
      act: (schedule) =>
        create({ schedule, volunteerId: schedule.unqualified.volunteerId }),
      status: 409,
      body: refusal.notQualified,
    },
    {
      name: 'an Assignment already on the Shift outranks a full requirement',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'back' }),
      act: (schedule) =>
        create({
          schedule,
          volunteerId: schedule.free.volunteerId,
          shiftRequirementId: schedule.front.id,
        }),
      status: 409,
      body: refusal.duplicate,
    },
    {
      name: 'a full requirement outranks an overlapping Assignment in another Ministry',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'other' }),
      act: (schedule) =>
        create({
          schedule,
          volunteerId: schedule.free.volunteerId,
          shiftRequirementId: schedule.front.id,
        }),
      status: 409,
      body: refusal.full,
    },
    {
      name: 'an overlapping Assignment is refused even when the Volunteer is also unavailable',
      arrange: async (schedule) => {
        await schedule.place({
          volunteerId: schedule.free.volunteerId,
          on: 'other',
        });
        await schedule.markUnavailable(schedule.free);
      },
      act: (schedule) =>
        create({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.duplicate,
    },
  ]);

  it('assigns an unavailable Volunteer with a warning, audits it and starts assigning', async () => {
    const schedule = await seedSchedule();
    await schedule.markUnavailable(schedule.free);

    const response = await create({
      schedule,
      volunteerId: schedule.free.volunteerId,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.warnings).toEqual([
      {
        type: 'UNAVAILABLE',
        details: 'Volunteer is marked unavailable for this shift',
      },
    ]);
    const created = await db
      .select()
      .from(assignment)
      .where(eq(assignment.volunteerId, schedule.free.volunteerId));
    expect(created).toMatchObject([
      {
        shiftId: schedule.shift.id,
        shiftRequirementId: schedule.backNeed.id,
        participationId: schedule.participationId,
        status: 'pending',
        assignedBy: schedule.adminUserId,
      },
    ]);
    expect(
      (await db.select().from(assignmentAudit)).map(
        ({ assignmentId, actorId, action, correlationId }) => ({
          assignmentId,
          actorId,
          action,
          correlationId,
        }),
      ),
    ).toEqual([
      {
        assignmentId: created[0]?.id,
        actorId: schedule.adminUserId,
        action: 'created',
        correlationId: null,
      },
    ]);
    const [participation] = await db
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, schedule.participationId));
    expect(participation?.state).toBe('assigning');
  });

  it('leaves a published Schedule published when it assigns', async () => {
    const schedule = await seedSchedule();
    await schedule.setState('published');

    const response = await create({
      schedule,
      volunteerId: schedule.free.volunteerId,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().warnings).toEqual([]);
    const [participation] = await db
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, schedule.participationId));
    expect(participation?.state).toBe('published');
  });
});

describe('reassign (swap cover) refusal precedence', () => {
  pinRefusals([
    {
      name: 'a started Shift outranks a cancelled Event',
      arrange: async (schedule) => {
        await schedule.cancelEvent();
        startShift();
      },
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.shiftStarted,
    },
    {
      name: 'a cancelled Event outranks its cancelled time block',
      arrange: async (schedule) => {
        await schedule.cancelEvent();
        await schedule.cancelBlock();
      },
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.eventCancelled,
    },
    {
      name: 'a cancelled time block outranks a non-member',
      arrange: (schedule) => schedule.cancelBlock(),
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.outsiderId }),
      status: 409,
      body: refusal.blockCancelled,
    },
    {
      name: 'a non-member is refused as not in the Ministry',
      arrange: async () => undefined,
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.outsiderId }),
      status: 409,
      body: refusal.notInMinistry,
    },
    {
      name: 'a member without the Role is refused as unqualified',
      arrange: async () => undefined,
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.unqualified.volunteerId }),
      status: 409,
      body: refusal.notQualified,
    },
    {
      name: 'the replaced Volunteer is refused as already on the Shift',
      arrange: async () => undefined,
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.holder.volunteerId }),
      status: 409,
      body: refusal.duplicate,
    },
    {
      name: 'an overlap is refused, while the replaced place leaves the full requirement room',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'other' }),
      act: (schedule) =>
        reassign({ schedule, volunteerId: schedule.free.volunteerId }),
      status: 409,
      body: refusal.duplicate,
    },
  ]);

  it('covers the open swap request, replaces the Assignment and audits the new one', async () => {
    const schedule = await seedSchedule();
    const request = await schedule.openSwapRequest();

    const response = await reassign({
      schedule,
      volunteerId: schedule.free.volunteerId,
    });

    expect(response.statusCode).toBe(200);
    const rows = await db
      .select()
      .from(assignment)
      .where(eq(assignment.shiftId, schedule.shift.id));
    expect(rows).toMatchObject([
      {
        volunteerId: schedule.free.volunteerId,
        shiftRequirementId: schedule.front.id,
        status: 'pending',
        assignedBy: schedule.adminUserId,
      },
    ]);
    const replacement = rows[0]?.id;
    expect(response.json()).toMatchObject({ id: replacement });
    const audits = await db.select().from(assignmentAudit);
    expect(
      audits.map(({ assignmentId, actorId, action }) => ({
        assignmentId,
        actorId,
        action,
      })),
    ).toEqual([
      {
        assignmentId: replacement,
        actorId: schedule.adminUserId,
        action: 'created',
      },
      {
        assignmentId: replacement,
        actorId: schedule.adminUserId,
        action: 'updated',
      },
    ]);
    const [closed] = await db
      .select()
      .from(swapRequest)
      .where(eq(swapRequest.id, request.id));
    expect(closed).toMatchObject({
      status: 'covered',
      closedBy: schedule.adminUserId,
      assignmentId: schedule.held.id,
    });
    const [participation] = await db
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, schedule.participationId));
    expect(participation?.state).toBe('assigning');
  });
});

describe('move refusal precedence', () => {
  pinRefusals([
    {
      name: 'a started Shift outranks a target on another Shift',
      arrange: async () => startShift(),
      act: (schedule) =>
        move({ schedule, shiftRequirementId: schedule.laterNeed.id }),
      status: 409,
      body: refusal.shiftStarted,
    },
    {
      name: 'a target on another Shift outranks a full target',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'later' }),
      act: (schedule) =>
        move({ schedule, shiftRequirementId: schedule.laterNeed.id }),
      status: 409,
      body: refusal.invalidMoveTarget,
    },
    {
      name: 'a target of another Role is refused',
      arrange: async () => undefined,
      act: (schedule) =>
        move({ schedule, shiftRequirementId: schedule.otherNeed.id }),
      status: 409,
      body: refusal.invalidMoveTarget,
    },
    {
      name: 'a full target is refused',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'back' }),
      act: (schedule) =>
        move({ schedule, shiftRequirementId: schedule.backNeed.id }),
      status: 409,
      body: refusal.full,
    },
  ]);
});

describe('remove', () => {
  it('refuses a started Shift and writes nothing', async () => {
    const schedule = await seedSchedule();
    startShift();
    const before = await writes();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assign/assignments/${schedule.held.id}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(refusal.shiftStarted);
    expect(await writes()).toEqual(before);
  });

  it('audits the removal, covers the open swap request and deletes the row', async () => {
    const schedule = await seedSchedule();
    const request = await schedule.openSwapRequest();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assign/assignments/${schedule.held.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(
      await db
        .select()
        .from(assignment)
        .where(eq(assignment.id, schedule.held.id)),
    ).toEqual([]);
    expect(
      (await db.select().from(assignmentAudit)).map(
        ({ assignmentId, actorId, action }) => ({
          assignmentId,
          actorId,
          action,
        }),
      ),
    ).toEqual([
      {
        assignmentId: schedule.held.id,
        actorId: schedule.adminUserId,
        action: 'deleted',
      },
    ]);
    const [closed] = await db
      .select()
      .from(swapRequest)
      .where(eq(swapRequest.id, request.id));
    expect(closed).toMatchObject({
      status: 'covered',
      closedBy: schedule.adminUserId,
    });
  });
});

describe('proposal Apply refusal precedence', () => {
  interface Pair {
    shiftRequirementId: string;
    volunteerId: string;
  }

  interface ApplyInput {
    schedule: Schedule;
    additions: Pair[];
    excludedAdditions?: Pair[];
    reviewToken?: string;
  }

  function apply({
    schedule,
    additions,
    excludedAdditions,
    reviewToken = proposalReviewTokenFor({
      cycleId: schedule.cycleId,
      ministryId: schedule.ministryId,
      additions: additions as ReviewedAddition[],
    }),
  }: ApplyInput) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/assign/cycles/${schedule.cycleId}/assignment-proposal/apply?ministryId=${schedule.ministryId}`,
      payload: {
        applicationKey: randomUUID(),
        reviewToken,
        additions,
        ...(excludedAdditions ? { excludedAdditions } : {}),
      },
    });
  }

  const freeOnBack = (schedule: Schedule): Pair[] => [
    {
      shiftRequirementId: schedule.backNeed.id,
      volunteerId: schedule.free.volunteerId,
    },
  ];

  interface ApplyCase {
    name: string;
    arrange: (schedule: Schedule) => Promise<unknown>;
    additions?: (schedule: Schedule) => Pair[];
    body: object;
    status?: number;
  }

  const stale = {
    error: 'ASSIGNMENT_PROPOSAL_STALE',
    message: m.error_assignment_proposal_stale(),
  };

  const cases: ApplyCase[] = [
    {
      name: 'a cancelled time block outranks a published Schedule',
      arrange: async (schedule) => {
        await schedule.cancelBlock();
        await schedule.setState('published');
      },
      body: refusal.blockCancelled,
    },
    {
      name: 'a cancelled Event outranks its cancelled time block',
      arrange: async (schedule) => {
        await schedule.cancelEvent();
        await schedule.cancelBlock();
      },
      body: refusal.eventCancelled,
    },
    {
      name: 'a cancelled time block outranks a started Shift',
      arrange: async (schedule) => {
        await schedule.cancelBlock();
        startShift();
      },
      body: refusal.blockCancelled,
    },
    {
      name: 'a published Schedule outranks a stale pair',
      arrange: async (schedule) => {
        await schedule.setState('published');
        startShift();
      },
      body: {
        error: 'SCHEDULE_ALREADY_PUBLISHED',
        message: m.error_schedule_already_published(),
      },
    },
    {
      name: 'a Schedule still preparing is refused',
      arrange: (schedule) => schedule.setState('preparing'),
      body: {
        error: 'ILLEGAL_STATE_TRANSITION',
        message: m.error_illegal_state_transition(),
      },
    },
    {
      name: 'a non-member is stale',
      arrange: async () => undefined,
      additions: (schedule) => [
        {
          shiftRequirementId: schedule.backNeed.id,
          volunteerId: schedule.outsiderId,
        },
      ],
      body: stale,
    },
    {
      name: 'an ended membership is stale',
      arrange: (schedule) =>
        db
          .update(ministryMembership)
          .set({ status: 'inactive' })
          .where(eq(ministryMembership.id, schedule.free.membershipId)),
      body: stale,
    },
    {
      name: 'a Volunteer not asked this Cycle is stale',
      arrange: async () => undefined,
      additions: (schedule) => [
        {
          shiftRequirementId: schedule.backNeed.id,
          volunteerId: schedule.unasked.volunteerId,
        },
      ],
      body: stale,
    },
    {
      name: 'a removed Role is stale',
      arrange: (schedule) =>
        db
          .delete(ministryMembershipRole)
          .where(
            eq(
              ministryMembershipRole.ministryMembershipId,
              schedule.free.membershipId,
            ),
          ),
      body: stale,
    },
    {
      name: 'an unavailable mark is stale',
      arrange: (schedule) => schedule.markUnavailable(schedule.free),
      body: stale,
    },
    {
      name: 'an overlap in another Ministry is stale',
      arrange: (schedule) =>
        schedule.place({ volunteerId: schedule.free.volunteerId, on: 'other' }),
      body: stale,
    },
    {
      name: 'a full requirement is stale',
      arrange: async () => undefined,
      additions: (schedule) => [
        {
          shiftRequirementId: schedule.front.id,
          volunteerId: schedule.free.volunteerId,
        },
      ],
      body: stale,
    },
    {
      name: 'two pairs placing one Volunteer twice on a Shift are stale',
      arrange: (schedule) =>
        db
          .update(shiftRequirement)
          .set({ peopleNeeded: 2 })
          .where(eq(shiftRequirement.id, schedule.front.id)),
      additions: (schedule) => [
        {
          shiftRequirementId: schedule.backNeed.id,
          volunteerId: schedule.free.volunteerId,
        },
        {
          shiftRequirementId: schedule.front.id,
          volunteerId: schedule.free.volunteerId,
        },
      ],
      body: stale,
    },
  ];

  for (const { name, arrange, additions = freeOnBack, body, status } of cases) {
    it(name, async () => {
      const schedule = await seedSchedule();
      await arrange(schedule);
      const before = await writes();

      const response = await apply({
        schedule,
        additions: additions(schedule),
      });

      expect(response.statusCode).toBe(status ?? 409);
      expect(response.json()).toEqual(body);
      expect(await writes()).toEqual(before);
    });
  }

  it('checks the review token before the exclusions', async () => {
    const schedule = await seedSchedule();
    const before = await writes();

    const response = await apply({
      schedule,
      additions: freeOnBack(schedule),
      excludedAdditions: freeOnBack(schedule),
      reviewToken: 'not-the-token',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'ASSIGNMENT_PROPOSAL_CHANGED',
      message: m.error_assignment_proposal_changed(),
    });
    expect(await writes()).toEqual(before);
  });

  it('places back-to-back pairs of one Volunteer and starts assigning', async () => {
    const schedule = await seedSchedule();
    const additions = [
      {
        shiftRequirementId: schedule.backNeed.id,
        volunteerId: schedule.free.volunteerId,
      },
      {
        shiftRequirementId: schedule.laterNeed.id,
        volunteerId: schedule.free.volunteerId,
      },
    ];

    const response = await apply({ schedule, additions });

    expect(response.statusCode).toBe(200);
    const rows = await db
      .select()
      .from(assignment)
      .where(eq(assignment.volunteerId, schedule.free.volunteerId));
    expect(
      rows
        .map(({ shiftRequirementId, status, assignedBy }) => ({
          shiftRequirementId,
          status,
          assignedBy,
        }))
        .sort((left, right) =>
          left.shiftRequirementId.localeCompare(right.shiftRequirementId),
        ),
    ).toEqual(
      additions
        .map(({ shiftRequirementId }) => ({
          shiftRequirementId,
          status: 'pending',
          assignedBy: schedule.adminUserId,
        }))
        .sort((left, right) =>
          left.shiftRequirementId.localeCompare(right.shiftRequirementId),
        ),
    );
    const [participation] = await db
      .select()
      .from(ministryParticipation)
      .where(eq(ministryParticipation.id, schedule.participationId));
    expect(participation?.state).toBe('assigning');
  });
});
