import { appConfig } from '@church/app-config';
import {
  availabilityAsk,
  availabilityCheck,
  cycle,
  ministryMembership,
  ministryParticipation,
  outboxMessage,
  unavailableShift,
} from '@church/db';
import { parseInstant, setTestClock } from '@church/time';
import { eq, sql } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
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
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
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
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);
let app: FastifyTypedInstance;
const ROOT = '/api/v1/volunteer/availability-checks';

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const managers = createSchedulingManagers();
  const activeChurchResolver = new DbActiveChurchResolver({
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
  });
  const controller = new VolunteerController({
    volunteerManager: managers.volunteerManager,
    activeChurchResolver,
    config: appConfig,
  });
  const assignController = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver,
    authorityGuard: {
      decideManageMinistry: async () => ({ allowed: true }),
    } as never,
    config: appConfig,
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
      instance.register(
        assignController.registerRoutes.bind(assignController),
        { prefix: assignController.prefix },
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
  setTestClock({ instant: parseInstant({ value: '2026-09-06T12:00:00Z' }) });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function seedCheck() {
  const base = await seedSchedulingPhase3Base();
  const churchId = base.churchAId;
  const ministryId = base.ministryAId;
  const period = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-30'),
    state: 'sent',
  });
  const member = await seedVolunteerMembership({
    churchId,
    ministryId,
    name: 'Answering Volunteer',
    email: 'answering@test.com',
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: member.volunteer.userId,
    accessLevel: 'member',
  });
  const role = await seedRole({ churchId, ministryId, name: 'Teacher' });
  await seedRoleQualification({
    churchId,
    membershipId: member.membership.id,
    roleId: role.id,
  });
  const check = await buildAvailabilityCheck({
    db,
    churchId,
    cycleId: period.id,
    ministryMembershipId: member.membership.id,
    state: 'pending',
  });
  await db.insert(availabilityAsk).values({
    churchId,
    ministryId,
    cycleId: period.id,
    askedAt: new Date('2026-08-01'),
    answerBy: '2026-09-05',
  });
  getSession.mockResolvedValue({
    user: { id: member.volunteer.userId },
    session: { activeOrganizationId: churchId },
  } as never);
  return { base, churchId, ministryId, period, member, role, check };
}

async function seedAnswer() {
  const seeded = await seedCheck();
  const { churchId, ministryId, period, role } = seeded;
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    ministryId,
    cycleId: period.id,
    title: 'Night Service',
    start: new Date('2026-09-07T01:00:00Z'),
    end: new Date('2026-09-07T02:00:00Z'),
    status: 'scheduled',
  });
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: new Date('2026-09-07T01:00:00Z'),
    endTime: new Date('2026-09-07T02:00:00Z'),
    label: 'Night',
  });
  const requirement = await seedRequirement({
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 1,
  });
  return { ...seeded, graph, shift, requirement };
}

describe('Volunteer answers through PostgreSQL', () => {
  it.each([
    { assignedAt: '2020-01-01T00:00:00Z', lateMark: true },
    { assignedAt: '2090-01-01T00:00:00Z', lateMark: false },
  ])('preserves the assignment ordering on repeated unchanged answers', async ({
    assignedAt,
    lateMark,
  }) => {
    const {
      churchId,
      ministryId,
      period,
      member,
      role,
      check,
      graph,
      shift,
      requirement,
    } = await seedAnswer();
    await buildAssignment({
      db,
      churchId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: member.volunteer.id,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status: 'pending',
      assignedAt: parseInstant({ value: assignedAt }),
    });
    const first = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [shift.id] },
    });
    expect(first.statusCode).toBe(200);
    const [mark] = await db
      .select()
      .from(unavailableShift)
      .where(eq(unavailableShift.availabilityCheckId, check.id));
    for (let index = 0; index < 2; index++) {
      const saved = await app.inject({
        method: 'PUT',
        url: `${ROOT}/${check.id}/answer`,
        payload: { shiftIds: [shift.id] },
      });
      expect(saved.statusCode).toBe(200);
      expect(
        await db
          .select()
          .from(unavailableShift)
          .where(eq(unavailableShift.availabilityCheckId, check.id)),
      ).toEqual([mark]);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/assign/cycles/${period.id}/builder?ministryId=${ministryId}`,
      });
      expect(response.statusCode, response.body).toBe(200);
      const body: CycleBuilderResponse = response.json();
      const shifts = body.events.flatMap((event) =>
        event.eventTimeBlocks.flatMap((block) => block.shifts),
      );
      expect(
        shifts.find((row) => row.shift.id === shift.id)?.assignments,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            volunteerId: member.volunteer.id,
            lateMark,
          }),
        ]),
      );
    }
  });

  it('replaces marks and confirms a pending check in one answer', async () => {
    const { check, shift, churchId } = await seedAnswer();
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: shift.id,
    });
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: 'confirmed',
      shifts: [{ shiftId: shift.id, available: true }],
    });
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored?.state).toBe('confirmed');
    expect(stored?.confirmedAt).toBeInstanceOf(Date);
    expect(await db.select().from(unavailableShift)).toEqual([]);
  });
  it.each([
    'shift',
    'day',
  ])('refuses published Shift marks (%s) with their ids and leaves the pending check untouched', async (mode) => {
    const { check, graph, shift } = await seedAnswer();
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload:
        mode === 'shift'
          ? { shiftIds: [shift.id] }
          : { shiftIds: [], wholeDayDates: ['2026-09-06'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'SHIFT_PUBLISHED',
      shiftIds: [shift.id],
    });
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored).toMatchObject({ state: 'pending', confirmedAt: null });
    expect(await db.select().from(unavailableShift)).toEqual([]);
  });

  it('refuses a Past-Cycle answer without changing its marks or confirmation', async () => {
    const { check, period, churchId, shift } = await seedAnswer();
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: shift.id,
    });
    await db
      .update(cycle)
      .set({ state: 'past' })
      .where(eq(cycle.id, period.id));
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored).toMatchObject({ state: 'pending', confirmedAt: null });
    const marks = await db.select().from(unavailableShift);
    expect(marks.map((mark) => mark.shiftId)).toEqual([shift.id]);
  });

  it.each([
    {},
    { shiftIds: 'invalid' },
    { shiftIds: [42] },
    { shiftIds: ['not-a-shift-id'] },
    { shiftIds: [], wholeDayDates: ['2026-02-30'] },
    { shiftIds: [], wholeDayDates: ['2026-09-06T00:00:00Z'] },
  ])('refuses malformed answers with 422: %j', async (payload) => {
    const { check } = await seedCheck();
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('VALIDATION_ERROR');
  });

  it('expands CalendarDays in Church Timezone, replaces marks after the Deadline and keeps the first confirmation time silently', async () => {
    const { check, shift } = await seedAnswer();
    const initial = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [], wholeDayDates: ['2026-09-06'] },
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      state: 'confirmed',
      shifts: [{ shiftId: shift.id, available: false }],
    });
    expect(initial.json().confirmedAt).toEqual(expect.any(String));
    const marked = await db.select().from(unavailableShift);
    expect(marked.map((mark) => mark.shiftId)).toEqual([shift.id]);
    setTestClock({ instant: parseInstant({ value: '2026-09-08T12:00:00Z' }) });
    const edited = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      state: 'confirmed',
      confirmedAt: initial.json().confirmedAt,
      shifts: [{ shiftId: shift.id, available: true }],
    });
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored?.confirmedAt?.toISOString()).toBe(initial.json().confirmedAt);
    expect(await db.select().from(unavailableShift)).toEqual([]);
    expect(await db.select().from(outboxMessage)).toEqual([]);
  });

  it('preserves a published unavailable mark while editable marks change or are cleared', async () => {
    const { check, shift, graph, churchId, ministryId, period, role } =
      await seedAnswer();
    const editableGraph = await createSchedulingPhase3EventGraph({
      churchId,
      ministryId,
      cycleId: period.id,
      title: 'Editable Service',
      start: new Date('2026-09-08T12:00:00Z'),
      end: new Date('2026-09-08T14:00:00Z'),
      status: 'scheduled',
    });
    const editable = await seedShift({
      churchId,
      participationId: editableGraph.participation.id,
      eventTimeBlockId: editableGraph.eventTimeBlock.id,
      startTime: new Date('2026-09-08T12:00:00Z'),
      endTime: new Date('2026-09-08T14:00:00Z'),
      label: 'Editable',
    });
    await seedRequirement({
      churchId,
      participationId: editableGraph.participation.id,
      shiftId: editable.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const initial = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [shift.id] },
    });
    expect(initial.statusCode).toBe(200);
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    setTestClock({ instant: parseInstant({ value: '2026-09-08T12:00:00Z' }) });
    for (const editableMarks of [[editable.id], []]) {
      const response = await app.inject({
        method: 'PUT',
        url: `${ROOT}/${check.id}/answer`,
        payload: { shiftIds: editableMarks },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        state: 'confirmed',
        confirmedAt: initial.json().confirmedAt,
        shifts: [
          { shiftId: shift.id, published: true, available: false },
          {
            shiftId: editable.id,
            published: false,
            available: editableMarks.length === 0,
          },
        ],
      });
      const storedMarks = await db
        .select()
        .from(unavailableShift)
        .where(eq(unavailableShift.availabilityCheckId, check.id));
      expect(storedMarks.map((mark) => mark.shiftId).sort()).toEqual(
        [shift.id, ...editableMarks].sort(),
      );
      const [storedCheck] = await db
        .select()
        .from(availabilityCheck)
        .where(eq(availabilityCheck.id, check.id));
      expect(storedCheck?.confirmedAt?.toISOString()).toBe(
        initial.json().confirmedAt,
      );
      expect(await db.select().from(outboxMessage)).toEqual([]);
    }
  });

  it('rolls marks back when confirming fails in PostgreSQL', async () => {
    const { check, shift, churchId } = await seedAnswer();
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: shift.id,
    });
    await db.execute(
      sql`CREATE FUNCTION fail_answer_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected answer failure'; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER fail_answer_confirmation BEFORE UPDATE ON availability_check FOR EACH ROW EXECUTE FUNCTION fail_answer_confirmation()`,
    );
    try {
      const response = await app.inject({
        method: 'PUT',
        url: `${ROOT}/${check.id}/answer`,
        payload: { shiftIds: [] },
      });
      expect(response.statusCode).toBe(500);
      const [stored] = await db
        .select()
        .from(availabilityCheck)
        .where(eq(availabilityCheck.id, check.id));
      expect(stored).toMatchObject({ state: 'pending', confirmedAt: null });
      const marks = await db.select().from(unavailableShift);
      expect(marks.map((mark) => mark.shiftId)).toEqual([shift.id]);
      expect(await db.select().from(outboxMessage)).toEqual([]);
    } finally {
      await db.execute(
        sql`DROP TRIGGER fail_answer_confirmation ON availability_check`,
      );
      await db.execute(sql`DROP FUNCTION fail_answer_confirmation()`);
    }
  });

  it('retains the scope refusal without marks or confirmation', async () => {
    const { check } = await seedCheck();
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: ['99999999-9999-4999-8999-999999999999'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('CROSS_MINISTRY_SCOPE');
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored).toMatchObject({ state: 'pending', confirmedAt: null });
    expect(await db.select().from(unavailableShift)).toEqual([]);
  });

  it('keeps gatekeeper 401, 403 and private 404 refusals on answers', async () => {
    const { churchId, ministryId, check } = await seedCheck();
    const other = await seedVolunteerMembership({
      churchId,
      ministryId,
      name: 'Other Volunteer',
      email: 'other@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: other.volunteer.userId,
      accessLevel: 'member',
    });
    getSession.mockResolvedValue({
      user: { id: other.volunteer.userId },
      session: { activeOrganizationId: churchId },
    } as never);
    for (const id of [check.id, '99999999-9999-4999-8999-999999999999']) {
      const hidden = await app.inject({
        method: 'PUT',
        url: `${ROOT}/${id}/answer`,
        payload: { shiftIds: [] },
      });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json().error).toBe('NOT_FOUND');
    }
    await db
      .update(ministryMembership)
      .set({ status: 'inactive', leftAt: new Date() })
      .where(eq(ministryMembership.id, other.membership.id));
    const inactive = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(inactive.statusCode).toBe(403);
    const plain = await buildUser({
      db,
      id: 'plain-member',
      name: 'Plain Member',
      email: 'plain@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: plain.id,
      accessLevel: 'member',
    });
    getSession.mockResolvedValue({
      user: { id: plain.id },
      session: { activeOrganizationId: churchId },
    } as never);
    const forbidden = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(forbidden.statusCode).toBe(403);
    getSession.mockResolvedValue(null as never);
    const signedOut = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: { shiftIds: [] },
    });
    expect(signedOut.statusCode).toBe(401);
  });
  it('deduplicates explicit and whole-day marks while replacing existing marks and confirming', async () => {
    const { check, shift } = await seedAnswer();
    const response = await app.inject({
      method: 'PUT',
      url: `${ROOT}/${check.id}/answer`,
      payload: {
        shiftIds: [shift.id, shift.id],
        wholeDayDates: ['2026-09-06'],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: 'confirmed',
      confirmedAt: '2026-09-06T12:00:00.000Z',
      shifts: [{ shiftId: shift.id, available: false }],
    });
    const marks = await db.select().from(unavailableShift);
    expect(marks.map((mark) => mark.shiftId)).toEqual([shift.id]);
  });
  it('accepts concurrent answers with a single confirmation timestamp', async () => {
    const { check } = await seedCheck();
    const responses = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `${ROOT}/${check.id}/answer`,
        payload: { shiftIds: [] },
      }),
      app.inject({
        method: 'PUT',
        url: `${ROOT}/${check.id}/answer`,
        payload: { shiftIds: [] },
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200,
    ]);
    expect(responses.map((response) => response.json().confirmedAt)).toEqual([
      '2026-09-06T12:00:00.000Z',
      '2026-09-06T12:00:00.000Z',
    ]);
    const [stored] = await db
      .select()
      .from(availabilityCheck)
      .where(eq(availabilityCheck.id, check.id));
    expect(stored?.confirmedAt?.toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(await db.select().from(outboxMessage)).toEqual([]);
  });
});
