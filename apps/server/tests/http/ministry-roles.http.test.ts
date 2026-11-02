import { randomUUID } from 'node:crypto';
import { assignment, ministry, ministryMembershipRole, role } from '@church/db';
import { m } from '@church/i18n/messages';
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  setTestClock,
} from '@church/time';
import { eq, sql } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { MinistryRoleController } from '@/api/controllers/ministry-role-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryRoleManager } from '@/application/db-ministry-role-manager';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };

const db = schedulingTestDb;
const roleRepository = new DrizzleRoleRepository({ db });

let app: FastifyTypedInstance;

beforeAll(async () => {
  const ministryRepo = new DrizzleMinistryRepository({ db });
  app = await createFastify({ locale: testLocale });
  // Real manager, repositories and AuthorityService; only the session and
  // Active Church selection are seams.
  const controller = new MinistryRoleController({
    ministryRoleManager: new DbMinistryRoleManager({
      ministryRepository: ministryRepo,
      roleRepository,
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: ministryRepo,
      }),
    }),
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

const CHURCH_A = '71111111-1111-4111-8111-111111111111';
const CHURCH_B = '72222222-2222-4222-8222-222222222222';

/** `leader` leads only Worship; `otherLeader` leads only Kids. */
type Persona = 'admin' | 'leader' | 'otherLeader' | 'volunteer' | 'member';

interface PersonaRecord {
  userId: string;
  volunteerId: string | null;
}

interface Fixture {
  personas: Record<Persona, PersonaRecord>;
  worshipId: string;
  kidsId: string;
  archivedMinistryId: string;
  foreignMinistryId: string;
  singerId: string;
  drumsId: string;
  archivedRoleId: string;
  teacherId: string;
  foreignRoleId: string;
}

let fixture: Fixture;

interface BuildPersonaInput {
  key: Persona;
  churchAccess: 'admin' | 'member';
  membership?: { ministryId: string; level: 'leader' | 'volunteer' };
}

async function buildPersona({
  key,
  churchAccess,
  membership,
}: BuildPersonaInput): Promise<PersonaRecord> {
  const userId = `roles-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@roles.test` });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId,
    accessLevel: churchAccess,
  });
  if (!membership) return { userId, volunteerId: null };
  const volunteer = await buildVolunteer({ db, churchId: CHURCH_A, userId });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: volunteer.id,
    ministryId: membership.ministryId,
    ministryAccessLevel: membership.level,
    roleIds: [],
  });
  return { userId, volunteerId: volunteer.id };
}

async function seed(): Promise<Fixture> {
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'roles-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'roles-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const archivedMinistry = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Old',
  });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archivedMinistry.id));
  const foreignMinistry = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  const child = { db, churchId: CHURCH_A, ministryId: worship.id };
  const singer = await buildRole({ ...child, name: 'Singer' });
  const drums = await buildRole({ ...child, name: 'drums' });
  const archivedRole = await buildRole({ ...child, name: 'Old Keys' });
  await db
    .update(role)
    .set({ archivedAt: new Date() })
    .where(eq(role.id, archivedRole.id));
  const teacher = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: kids.id,
    name: 'Teacher',
  });
  const foreignRole = await buildRole({
    db,
    churchId: CHURCH_B,
    ministryId: foreignMinistry.id,
    name: 'Foreign Role',
  });
  return {
    worshipId: worship.id,
    kidsId: kids.id,
    archivedMinistryId: archivedMinistry.id,
    foreignMinistryId: foreignMinistry.id,
    singerId: singer.id,
    drumsId: drums.id,
    archivedRoleId: archivedRole.id,
    teacherId: teacher.id,
    foreignRoleId: foreignRole.id,
    personas: {
      admin: await buildPersona({ key: 'admin', churchAccess: 'admin' }),
      leader: await buildPersona({
        key: 'leader',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'leader' },
      }),
      otherLeader: await buildPersona({
        key: 'otherLeader',
        churchAccess: 'member',
        membership: { ministryId: kids.id, level: 'leader' },
      }),
      volunteer: await buildPersona({
        key: 'volunteer',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'volunteer' },
      }),
      member: await buildPersona({ key: 'member', churchAccess: 'member' }),
    },
  };
}

function signIn(persona: Persona) {
  const { userId, volunteerId } = fixture.personas[persona];
  mockGetSession.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId,
    autoSelected: false,
  });
}

beforeEach(async () => {
  fixture = await seed();
});

const PT_BR = { locale: 'pt-BR' as const };

function rolesUrl(ministryId: string) {
  return `/api/v1/ministries/${ministryId}/roles`;
}

function list(ministryId: string) {
  return app.inject({ method: 'GET', url: rolesUrl(ministryId) });
}

function create(ministryId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: rolesUrl(ministryId),
    payload: payload as never,
  });
}

function rename(ministryId: string, roleId: string, payload: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `${rolesUrl(ministryId)}/${roleId}`,
    payload: payload as never,
  });
}

function archive(ministryId: string, roleId: string) {
  return app.inject({
    method: 'POST',
    url: `${rolesUrl(ministryId)}/${roleId}/archive`,
  });
}

async function listedNames(ministryId: string) {
  const res = await list(ministryId);
  return res.json().roles.map((item: { name: string }) => item.name);
}

function notFoundBody() {
  return { error: 'NOT_FOUND', message: m.error_not_found({}, PT_BR) };
}

describe('GET /ministries/:ministryId/roles', () => {
  it('lists active Roles alphabetically, ignoring case, to an admin without a Volunteer profile', async () => {
    signIn('admin');

    const res = await list(fixture.worshipId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      roles: [
        { id: fixture.drumsId, name: 'drums' },
        { id: fixture.singerId, name: 'Singer' },
      ],
    });
  });

  it("lists the leader's own Ministry and conceals another one as 404", async () => {
    signIn('leader');
    expect(await listedNames(fixture.worshipId)).toEqual(['drums', 'Singer']);

    const res = await list(fixture.kidsId);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(notFoundBody());
  });

  it('answers the same 404 for an archived, a foreign, a missing and a malformed Ministry', async () => {
    signIn('admin');

    for (const id of [
      fixture.archivedMinistryId,
      fixture.foreignMinistryId,
      randomUUID(),
      'nope',
    ]) {
      const res = await list(id);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(notFoundBody());
    }
  });

  it.each([
    'volunteer',
    'member',
  ] as const)('refuses a %s with 403 before looking the Ministry up', async (persona) => {
    signIn(persona);

    expect((await list(fixture.worshipId)).statusCode).toBe(403);
    expect((await list(randomUUID())).statusCode).toBe(403);
  });
});

describe('POST /ministries/:ministryId/roles', () => {
  it.each([
    'admin',
    'leader',
  ] as const)('lets the %s add a trimmed, name-only Role', async (persona) => {
    signIn(persona);

    const res = await create(fixture.worshipId, { name: '  Keys  ' });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: 'Keys' });
    expect(await listedNames(fixture.worshipId)).toEqual([
      'drums',
      'Keys',
      'Singer',
    ]);
  });

  it('refuses an active case variant with a localized ROLE_NAME_IN_USE', async () => {
    signIn('admin');

    const res = await create(fixture.worshipId, { name: 'SINGER' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'ROLE_NAME_IN_USE',
      message: m.error_role_name_in_use({}, PT_BR),
    });
  });

  it('answers the conflict in English when the request locale is English', async () => {
    signIn('admin');

    const res = await app.inject({
      method: 'POST',
      url: rolesUrl(fixture.worshipId),
      payload: { name: 'singer' },
      cookies: { [testLocale.localeCookieName]: 'en' },
    });

    expect(res.json()).toEqual({
      error: 'ROLE_NAME_IN_USE',
      message: m.error_role_name_in_use({}, { locale: 'en' }),
    });
  });

  it('allows the name in another Ministry and reuses an archived name as a new identity', async () => {
    signIn('admin');

    expect((await create(fixture.kidsId, { name: 'Singer' })).statusCode).toBe(
      201,
    );
    const reused = await create(fixture.worshipId, { name: 'old keys' });

    expect(reused.statusCode).toBe(201);
    expect(reused.json().id).not.toBe(fixture.archivedRoleId);
  });

  it('lets exactly one of two concurrent case-variant creates win', async () => {
    signIn('admin');

    const results = await Promise.all([
      create(fixture.worshipId, { name: 'Bass' }),
      create(fixture.worshipId, { name: 'BASS' }),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
  });

  it.each([
    ['blank', { name: '   ' }],
    ['overlength', { name: 'x'.repeat(256) }],
    ['missing', {}],
  ])('refuses a %s name with 422 VALIDATION_ERROR', async (_label, payload) => {
    signIn('admin');

    const res = await create(fixture.worshipId, payload);

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('VALIDATION_ERROR');
  });

  it('refuses a leader of another Ministry with 404 and a Volunteer with 403', async () => {
    signIn('otherLeader');
    expect((await create(fixture.worshipId, { name: 'Keys' })).statusCode).toBe(
      404,
    );

    signIn('volunteer');
    expect((await create(fixture.worshipId, { name: 'Keys' })).statusCode).toBe(
      403,
    );
    expect(await roleNames(fixture.worshipId)).not.toContain('Keys');
  });
});

describe('PATCH /ministries/:ministryId/roles/:roleId', () => {
  it('renames in place, keeping the identity for historical reads', async () => {
    signIn('leader');

    const res = await rename(fixture.worshipId, fixture.singerId, {
      name: 'Lead Singer',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: fixture.singerId, name: 'Lead Singer' });
    const historical = await roleRepository.getById({
      churchId: CHURCH_A as never,
      id: fixture.singerId as never,
    });
    expect(historical.name).toBe('Lead Singer');
  });

  it('accepts a case-only rename of the same Role and refuses another active name', async () => {
    signIn('admin');

    expect(
      (await rename(fixture.worshipId, fixture.singerId, { name: 'SINGER' }))
        .statusCode,
    ).toBe(200);
    const conflict = await rename(fixture.worshipId, fixture.singerId, {
      name: 'Drums',
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('ROLE_NAME_IN_USE');
  });

  it('answers 404 for an archived Role, one of another Ministry, a foreign, a missing and a malformed id', async () => {
    signIn('admin');

    for (const id of [
      fixture.archivedRoleId,
      fixture.teacherId,
      fixture.foreignRoleId,
      randomUUID(),
      'nope',
    ]) {
      const res = await rename(fixture.worshipId, id, { name: 'Renamed' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(notFoundBody());
    }
  });
});

async function roleNames(ministryId: string) {
  const rows = await db
    .select({ name: role.name })
    .from(role)
    .where(eq(role.ministryId, ministryId));
  return rows.map((row) => row.name);
}

const NOW = parseInstant({ value: '2026-11-15T12:00:00Z' });

interface PlannedEvent {
  cycleId: string;
  eventId: string;
  eventTimeBlockId: string;
  participationId: string;
  shiftId: string;
}

interface PlanEventInput {
  title: string;
  start: string;
  end: string;
}

let cycleId: string;
let sectorId: string;

/** A Worship participation in one Event of the shared Cycle, with one Shift. */
async function planEvent({
  title,
  start,
  end,
}: PlanEventInput): Promise<PlannedEvent> {
  const startAt = parseInstant({ value: start });
  const endAt = parseInstant({ value: end });
  const planned = await buildEvent({
    db,
    churchId: CHURCH_A,
    cycleId,
    title,
    start: startAt,
    end: endAt,
    status: 'scheduled',
  });
  const block = await buildEventTimeBlock({
    db,
    churchId: CHURCH_A,
    eventId: planned.id,
    start: startAt,
    end: endAt,
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId: CHURCH_A,
    ministryId: fixture.worshipId,
    eventId: planned.id,
    state: 'preparing',
    eventTimeBlockIds: [block.id],
  });
  const plannedShift = await buildShift({
    db,
    churchId: CHURCH_A,
    participationId: participation.id,
    eventTimeBlockId: block.id,
    start: startAt,
    end: endAt,
  });
  return {
    cycleId,
    eventId: planned.id,
    eventTimeBlockId: block.id,
    participationId: participation.id,
    shiftId: plannedShift.id,
  };
}

interface RequireRoleInput {
  planned: PlannedEvent;
  roleId: string;
}

async function requireRole({ planned, roleId }: RequireRoleInput) {
  return buildShiftRequirement({
    db,
    churchId: CHURCH_A,
    participationId: planned.participationId,
    shiftId: planned.shiftId,
    roleId,
    sectorId,
    peopleNeeded: 1,
  });
}

async function seedPlanning() {
  setTestClock({ instant: NOW });
  const planningCycle = await buildCycle({
    db,
    churchId: CHURCH_A,
    name: 'November',
    startDate: parseCalendarDay({ value: '2026-11-01' }),
    endDate: parseCalendarDay({ value: '2026-11-30' }),
    state: 'draft',
  });
  cycleId = planningCycle.id;
  sectorId = (
    await buildSector({
      db,
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      name: 'Stage',
    })
  ).id;
}

async function isArchived(roleId: string) {
  const [row] = await db
    .select({ archivedAt: role.archivedAt })
    .from(role)
    .where(eq(role.id, roleId));
  return row?.archivedAt != null;
}

async function templateBlockId() {
  const template = await buildEventTemplate({
    db,
    churchId: CHURCH_A,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Morning',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '11:00' }),
      },
    ],
  });
  const [block] = template.blocks;
  if (!block) throw new Error('block seed failed');
  return block.id;
}

describe('POST /ministries/:ministryId/roles/:roleId/archive', () => {
  beforeEach(seedPlanning);

  it('archives a Role used only by qualifications and past service, keeping all of it', async () => {
    const past = await planEvent({
      title: 'Past',
      start: '2026-11-08T12:00:00Z',
      end: '2026-11-08T14:00:00Z',
    });
    const requirement = await requireRole({
      planned: past,
      roleId: fixture.singerId,
    });
    const { volunteer, membership } = await buildVolunteerWithMembership({
      db,
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      name: 'Ana',
      email: 'ana@roles.test',
      roleIds: [fixture.singerId],
    });
    await buildAssignment({
      db,
      churchId: CHURCH_A,
      participationId: past.participationId,
      shiftId: past.shiftId,
      volunteerId: volunteer.id,
      roleId: fixture.singerId,
      shiftRequirementId: requirement.id,
      status: 'confirmed',
    });
    signIn('leader');

    const res = await archive(fixture.worshipId, fixture.singerId);

    expect(res.statusCode).toBe(204);
    expect(await listedNames(fixture.worshipId)).toEqual(['drums']);
    const qualifications = await db
      .select()
      .from(ministryMembershipRole)
      .where(eq(ministryMembershipRole.ministryMembershipId, membership.id));
    expect(qualifications.map((row) => row.roleId)).toEqual([fixture.singerId]);
    const assignments = await db
      .select()
      .from(assignment)
      .where(eq(assignment.roleId, fixture.singerId));
    expect(assignments).toHaveLength(1);
    const historical = await roleRepository.getById({
      churchId: CHURCH_A as never,
      id: fixture.singerId as never,
    });
    expect(historical.name).toBe('Singer');
  });

  it.each([
    ['an upcoming', '2026-11-22T12:00:00Z', '2026-11-22T14:00:00Z'],
    ['an in-progress', '2026-11-15T11:00:00Z', '2026-11-15T13:00:00Z'],
  ])('refuses while %s requirement uses it, naming the location', async (_label, start, end) => {
    const upcoming = await planEvent({ title: 'Sunday', start, end });
    await requireRole({ planned: upcoming, roleId: fixture.singerId });
    signIn('admin');

    const res = await archive(fixture.worshipId, fixture.singerId);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'ROLE_IN_USE',
      message: m.error_role_in_use({}, PT_BR),
      blockers: [
        {
          kind: 'requirement',
          ministryId: fixture.worshipId,
          ministryName: 'Worship',
          cycleId,
          cycleName: 'November',
          eventId: upcoming.eventId,
          eventTimeBlockId: upcoming.eventTimeBlockId,
        },
      ],
    });
    expect(await isArchived(fixture.singerId)).toBe(false);
  });

  it('refuses while only a retained UsualSetup headcount uses it', async () => {
    const blockId = await templateBlockId();
    await buildUsualSetup({
      db,
      id: randomUUID(),
      churchId: CHURCH_A,
      ministryId: fixture.worshipId,
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [
        { shiftIndex: 0, sectorId, roleId: fixture.singerId, peopleNeeded: 2 },
      ],
    });
    signIn('admin');

    const res = await archive(fixture.worshipId, fixture.singerId);

    expect(res.statusCode).toBe(409);
    expect(res.json().blockers).toEqual([
      {
        kind: 'usual_setup',
        ministryId: fixture.worshipId,
        ministryName: 'Worship',
        templateTimeBlockId: blockId,
      },
    ]);
    expect(await isArchived(fixture.singerId)).toBe(false);
  });

  it('answers 404 for an archived Role, one of another Ministry and a Ministry the leader does not lead', async () => {
    signIn('admin');
    for (const id of [fixture.archivedRoleId, fixture.teacherId]) {
      const res = await archive(fixture.worshipId, id);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(notFoundBody());
    }

    signIn('otherLeader');
    expect(
      (await archive(fixture.worshipId, fixture.singerId)).statusCode,
    ).toBe(404);
    signIn('volunteer');
    expect(
      (await archive(fixture.worshipId, fixture.singerId)).statusCode,
    ).toBe(403);
    expect(await isArchived(fixture.singerId)).toBe(false);
  });
});

describe('archived Roles in fresh use', () => {
  beforeEach(seedPlanning);

  it('refuses an archived Role for a new requirement or UsualSetup headcount as not found', async () => {
    const upcoming = await planEvent({
      title: 'Sunday',
      start: '2026-11-22T12:00:00Z',
      end: '2026-11-22T14:00:00Z',
    });
    const { participationManager } = createSchedulingManagers();

    await expect(
      participationManager.upsertRequirement({
        churchId: CHURCH_A as never,
        shiftId: upcoming.shiftId as never,
        sectorId: sectorId as never,
        roleId: fixture.archivedRoleId as never,
        peopleNeeded: 1,
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(
      participationManager.saveUsualSetupBlock({
        churchId: CHURCH_A as never,
        ministryId: fixture.worshipId as never,
        entry: {
          sourceTemplateTimeBlockId: (await templateBlockId()) as never,
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [
            {
              shiftIndex: 0,
              sectorId: sectorId as never,
              roleId: fixture.archivedRoleId as never,
              peopleNeeded: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

interface Gate {
  wait: Promise<void>;
  open: () => void;
}

function gate(): Gate {
  let open = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Resolves once another connection is queued behind a row lock. */
async function untilLockWait() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await db.execute(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('No connection ever waited on a lock');
}

describe('archive racing fresh use', () => {
  beforeEach(seedPlanning);

  async function upcomingEvent() {
    return planEvent({
      title: 'Sunday',
      start: '2026-11-22T12:00:00Z',
      end: '2026-11-22T14:00:00Z',
    });
  }

  it('makes an archive wait for an in-flight requirement write, then refuses it', async () => {
    const upcoming = await upcomingEvent();
    const paused = gate();
    const writerLocked = gate();
    // The writer pauses holding its Role lock, before inserting.
    const pausingRepository: RoleRepository = Object.create(roleRepository);
    pausingRepository.lockActiveForUse = async (input) => {
      const locked = await roleRepository.lockActiveForUse(input);
      writerLocked.open();
      await paused.wait;
      return locked;
    };
    const { participationManager } = createSchedulingManagers({
      roleRepository: pausingRepository,
    });
    const write = participationManager.upsertRequirement({
      churchId: CHURCH_A as never,
      shiftId: upcoming.shiftId as never,
      sectorId: sectorId as never,
      roleId: fixture.singerId as never,
      peopleNeeded: 1,
    });
    await writerLocked.wait;
    signIn('admin');

    const archiving = archive(fixture.worshipId, fixture.singerId);
    await untilLockWait();
    paused.open();
    await write;
    const res = await archiving;

    expect(res.statusCode).toBe(409);
    expect(res.json().blockers).toMatchObject([
      { kind: 'requirement', eventId: upcoming.eventId },
    ]);
    expect(await isArchived(fixture.singerId)).toBe(false);
  });

  it('makes a requirement write wait for an in-flight archive, then refuses the archived Role', async () => {
    const upcoming = await upcomingEvent();
    const paused = gate();
    const archiveLocked = gate();
    // The archive pauses holding its Role lock, before reading blockers.
    const pausingRepository: RoleRepository = Object.create(roleRepository);
    pausingRepository.listArchiveBlockers = async (input) => {
      archiveLocked.open();
      await paused.wait;
      return roleRepository.listArchiveBlockers(input);
    };
    const archiving = new DbMinistryRoleManager({
      ministryRepository: new DrizzleMinistryRepository({ db }),
      roleRepository: pausingRepository,
      unitOfWork: new DrizzleUnitOfWork({ db }),
    }).archive({
      churchId: CHURCH_A as never,
      ministryId: fixture.worshipId as never,
      roleId: fixture.singerId as never,
    });
    await archiveLocked.wait;
    const { participationManager } = createSchedulingManagers();

    const write = participationManager.upsertRequirement({
      churchId: CHURCH_A as never,
      shiftId: upcoming.shiftId as never,
      sectorId: sectorId as never,
      roleId: fixture.singerId as never,
      peopleNeeded: 1,
    });
    const settled = write.then(
      () => 'written',
      (error: Error) => error.name,
    );
    await untilLockWait();
    paused.open();
    await archiving;

    expect(await settled).toBe('NotFoundError');
    expect(await isArchived(fixture.singerId)).toBe(true);
  });
});
