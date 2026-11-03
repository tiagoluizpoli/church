import { appConfig } from '@church/app-config';
import {
  identityAudit,
  ministryMembership,
  ministryMembershipRole,
  role,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { m } from '@church/i18n/messages';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { AssignController } from '@/api/controllers/assign-controller';
import { PeopleController } from '@/api/controllers/people-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbChurchAccessManager } from '@/application/db-church-access-manager';
import { DbMinistryMembershipManager } from '@/application/db-ministry-membership-manager';
import { DbMinistryRoleManager } from '@/application/db-ministry-role-manager';
import { DbPeopleListManager } from '@/application/db-people-list-manager';
import { ChurchId, MinistryId, RoleId } from '@/domain/branded-ids';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchAccessRepository } from '@/infrastructure/repositories/drizzle-church-access.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryMembershipRepository } from '@/infrastructure/repositories/drizzle-ministry-membership.repository';
import { DrizzlePeopleListRepository } from '@/infrastructure/repositories/drizzle-people-list.repository';
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
import {
  type AssignmentStatus,
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
  type EventStatus,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
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
const CHURCH_A = '95555555-5555-4555-8555-555555555555';
const CHURCH_B = '96666666-6666-4666-8666-666666666666';
const NOW = '2026-11-03T12:00:00.000Z';
const USER_HEADER = 'x-test-user';

let app: FastifyTypedInstance;
let roleManager: DbMinistryRoleManager;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const churchAccessRepository = new DrizzleChurchAccessRepository({ db });
  // Real managers, repositories, AuthorityService and PostgreSQL; only session and Active Church are seams.
  const controller = new PeopleController({
    peopleListManager: new DbPeopleListManager({
      peopleListRepository: new DrizzlePeopleListRepository({ db }),
      authorityManager,
      config: appConfig,
    }),
    churchAccessManager: new DbChurchAccessManager({
      authorityManager,
      churchAccessRepository,
      unitOfWork,
    }),
    ministryMembershipManager: new DbMinistryMembershipManager({
      authorityManager,
      churchAccessRepository,
      membershipRepository: new DrizzleMinistryMembershipRepository({ db }),
      roleRepository: new DrizzleRoleRepository({ db }),
      unitOfWork,
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: authorityManager }),
    config: appConfig,
  });
  roleManager = new DbMinistryRoleManager({
    ministryRepository: new DrizzleMinistryRepository({ db }),
    roleRepository: new DrizzleRoleRepository({ db }),
    unitOfWork,
  });
  const scheduling = createSchedulingManagers();
  // The Assign board's own authority is not under test here; its qualification locking is.
  const assign = new AssignController({
    participationManager: scheduling.participationManager,
    assignmentManager: scheduling.assignmentManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: {
      decideManageAnyMinistry: async () => ({ allowed: true }),
      decideManageParticipation: async () => ({ allowed: true }),
      decideManageShift: async () => ({ allowed: true }),
    } as never,
    config: appConfig,
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
      instance.register(assign.registerRoutes.bind(assign), {
        prefix: assign.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const memberId = (key: string, church = CHURCH_A) =>
  `m-${key}-${church.slice(0, 2)}`;

interface PersonInput {
  key: string;
  church?: string;
  access?: 'admin' | 'member';
}

async function person({
  key,
  church = CHURCH_A,
  access = 'member',
}: PersonInput) {
  await buildUser({
    db,
    id: key,
    name: key,
    email: `${key}@roles.test`,
  }).catch(() => undefined);
  await buildChurchMembership({
    db,
    id: memberId(key, church),
    churchId: church,
    userId: key,
    accessLevel: access,
  });
}

interface ServesInput {
  key: string;
  ministryId: string;
  level: 'leader' | 'volunteer';
  roleIds: string[];
  church?: string;
}

/** Ministry Membership ids by `${person}:${ministry}`. */
const memberships = new Map<string, string>();
const volunteers = new Map<string, string>();

async function serves({
  key,
  ministryId,
  level,
  roleIds,
  church = CHURCH_A,
}: ServesInput) {
  let volunteerId = volunteers.get(`${key}:${church}`);
  if (!volunteerId) {
    volunteerId = (await buildVolunteer({ db, churchId: church, userId: key }))
      .id;
    volunteers.set(`${key}:${church}`, volunteerId);
  }
  const membership = await buildMinistryMembership({
    db,
    churchId: church,
    volunteerId,
    ministryId,
    ministryAccessLevel: level,
    roleIds,
  });
  memberships.set(`${key}:${ministryId}`, membership.id);
  return membership.id;
}

interface Fixture {
  worship: string;
  kids: string;
  vocals: string;
  guitar: string;
  /** Archived; held by val. */
  keys: string;
  /** Archived; held by nobody. */
  drums: string;
  teacher: string;
  foreignRole: string;
}

let f: Fixture;

beforeEach(async () => {
  vi.resetAllMocks();
  memberships.clear();
  volunteers.clear();
  cycleId = undefined;
  setTestClock({ instant: parseInstant({ value: NOW }) });
  mockGetSession.mockImplementation((async ({
    headers,
  }: {
    headers: Headers;
  }) => {
    const id = headers.get(USER_HEADER);
    return id
      ? { user: { id }, session: { activeOrganizationId: null } }
      : null;
  }) as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'roles-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'roles-b',
    timezone: 'UTC',
  });
  const worship = (
    await buildMinistry({ db, churchId: CHURCH_A, name: 'Worship' })
  ).id;
  const kids = (await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' }))
    .id;
  const bMinistry = (
    await buildMinistry({ db, churchId: CHURCH_B, name: 'B Worship' })
  ).id;
  const newRole = async (ministryId: string, name: string, church = CHURCH_A) =>
    (await buildRole({ db, churchId: church, ministryId, name })).id;
  f = {
    worship,
    kids,
    vocals: await newRole(worship, 'Vocals'),
    guitar: await newRole(worship, 'Guitar'),
    keys: await newRole(worship, 'Keys'),
    drums: await newRole(worship, 'Drums'),
    teacher: await newRole(kids, 'Teacher'),
    foreignRole: await newRole(bMinistry, 'Foreign', CHURCH_B),
  };
  for (const key of ['ada', 'lea', 'pia', 'val', 'kim', 'ord']) {
    await person({ key, access: key === 'ada' ? 'admin' : 'member' });
  }
  // ada: admin without a Volunteer profile. lea: Worship leader with no Roles.
  await serves({
    key: 'lea',
    ministryId: worship,
    level: 'leader',
    roleIds: [],
  });
  await serves({
    key: 'pia',
    ministryId: worship,
    level: 'leader',
    roleIds: [f.vocals],
  });
  await serves({
    key: 'val',
    ministryId: worship,
    level: 'volunteer',
    roleIds: [f.vocals, f.keys],
  });
  // kim leads Kids and only volunteers in Worship.
  await serves({
    key: 'kim',
    ministryId: kids,
    level: 'leader',
    roleIds: [f.teacher],
  });
  await serves({
    key: 'kim',
    ministryId: worship,
    level: 'volunteer',
    roleIds: [f.guitar],
  });
  await db
    .update(role)
    .set({ archivedAt: new Date('2026-10-01T00:00:00.000Z') })
    .where(sql`${role.id} in (${f.keys}, ${f.drums})`);
});

afterEach(() => {
  resetClock();
});

interface EditInput {
  as?: string;
  member: string;
  membership: string;
  roleIds: unknown;
  locale?: string;
}

function editRoles({ as, member, membership, roleIds, locale }: EditInput) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/people/${memberId(member)}/ministry-memberships/${membership}/roles`,
    headers: as ? { [USER_HEADER]: as } : {},
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
    payload: { roleIds },
  });
}

async function heldRoles(membershipId: string) {
  const rows = await db
    .select({ roleId: ministryMembershipRole.roleId })
    .from(ministryMembershipRole)
    .where(eq(ministryMembershipRole.ministryMembershipId, membershipId));
  return rows.map((row) => row.roleId).sort();
}

const audits = () => db.select().from(identityAudit);

interface ServiceInput {
  key?: string;
  roleId: string;
  title: string;
  eventStart: string;
  eventEnd: string;
  /** Defaults to the whole Event. */
  shiftStart?: string;
  shiftEnd?: string;
  status?: AssignmentStatus;
  eventStatus?: EventStatus;
  sectorName?: string;
}

let cycleId: string | undefined;

/** A Worship Shift needing one Role on its own Event: Event → block → participation → Shift → requirement. */
async function openShift({
  roleId,
  title,
  eventStart,
  eventEnd,
  shiftStart = eventStart,
  shiftEnd = eventEnd,
  eventStatus = 'scheduled',
  sectorName = 'Stage',
}: ServiceInput) {
  cycleId ??= (
    await buildCycle({
      db,
      churchId: CHURCH_A,
      name: 'Novembro',
      startDate: '2026-11-01' as never,
      endDate: '2026-11-30' as never,
      state: 'sent',
    })
  ).id;
  const at = (value: string) => parseInstant({ value });
  const event = await buildEvent({
    db,
    churchId: CHURCH_A,
    cycleId,
    title,
    start: at(eventStart),
    end: at(eventEnd),
    status: eventStatus,
  });
  const block = await buildEventTimeBlock({
    db,
    churchId: CHURCH_A,
    eventId: event.id,
    start: at(eventStart),
    end: at(eventEnd),
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId: CHURCH_A,
    ministryId: f.worship,
    eventId: event.id,
    state: 'published',
    eventTimeBlockIds: [block.id],
  });
  const shift = await buildShift({
    db,
    churchId: CHURCH_A,
    participationId: participation.id,
    eventTimeBlockId: block.id,
    start: at(shiftStart),
    end: at(shiftEnd),
  });
  const sector = await buildSector({
    db,
    churchId: CHURCH_A,
    ministryId: f.worship,
    name: `${sectorName} ${title}`,
  });
  const requirement = await buildShiftRequirement({
    db,
    churchId: CHURCH_A,
    participationId: participation.id,
    shiftId: shift.id,
    roleId,
    sectorId: sector.id,
    peopleNeeded: 2,
  });
  return { event, block, participation, shift, sector, requirement };
}

/** One Worship Assignment on its own Event, returned in the blocker shape (less the Role name). */
async function service(input: ServiceInput) {
  const {
    key = 'val',
    roleId,
    title,
    eventStart,
    eventEnd,
    shiftStart = eventStart,
    shiftEnd = eventEnd,
    status = 'pending',
  } = input;
  const { event, block, participation, shift, sector, requirement } =
    await openShift(input);
  const assignment = await buildAssignment({
    db,
    churchId: CHURCH_A,
    participationId: participation.id,
    shiftId: shift.id,
    volunteerId: volunteers.get(`${key}:${CHURCH_A}`) ?? '',
    roleId,
    shiftRequirementId: requirement.id,
    status,
  });
  return {
    assignmentId: assignment.id,
    eventId: event.id,
    eventTitle: title,
    eventTimeBlockId: block.id,
    shiftId: shift.id,
    shiftStart: new Date(shiftStart).toISOString(),
    shiftEnd: new Date(shiftEnd).toISOString(),
    roleId,
    sectorId: sector.id,
    sectorName: sector.name,
    ministryId: f.worship,
    cycleId,
  };
}
const valWorship = () => memberships.get(`val:${f.worship}`) ?? '';

describe('PUT /people/:memberId/ministry-memberships/:membershipId/roles', () => {
  it('lets an admin without a Volunteer profile add a Role, recording one subject-attributed audit', async () => {
    const res = await editRoles({
      as: 'ada',
      member: 'val',
      membership: valWorship(),
      roleIds: [f.vocals, f.keys, f.guitar],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      memberId: memberId('val'),
      membershipId: valWorship(),
      ministryAccessLevel: 'volunteer',
      roles: [
        { id: f.guitar, name: 'Guitar', archived: false },
        { id: f.keys, name: 'Keys', archived: true },
        { id: f.vocals, name: 'Vocals', archived: false },
      ],
      changed: true,
    });
    expect(await heldRoles(valWorship())).toEqual(
      [f.vocals, f.keys, f.guitar].sort(),
    );
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      churchId: CHURCH_A,
      actorId: 'ada',
      subjectId: 'val',
      action: 'ministry_roles_changed',
      ministryInvitationId: null,
      details: {
        churchMembershipId: memberId('val'),
        ministryMembershipId: valWorship(),
        ministryId: f.worship,
        beforeRoleIds: [f.vocals, f.keys].sort(),
        afterRoleIds: [f.vocals, f.keys, f.guitar].sort(),
      },
      timestamp: new Date(NOW),
    });
    expect(rows[0]?.correlationId.length).toBeGreaterThan(0);
  });

  describe('authority and scope', () => {
    const ws = (key: string) => memberships.get(`${key}:${f.worship}`) ?? '';

    it('lets a leader edit a volunteer-level member of their Ministry and their own Roles, even to none', async () => {
      const volunteer = await editRoles({
        as: 'lea',
        member: 'val',
        membership: ws('val'),
        roleIds: [f.vocals],
      });
      expect(volunteer.statusCode).toBe(200);
      expect(await heldRoles(ws('val'))).toEqual([f.vocals]);

      const own = await editRoles({
        as: 'lea',
        member: 'lea',
        membership: ws('lea'),
        roleIds: [f.guitar],
      });
      expect(own.statusCode).toBe(200);
      const none = await editRoles({
        as: 'lea',
        member: 'lea',
        membership: ws('lea'),
        roleIds: [],
      });
      expect(none.statusCode).toBe(200);
      expect(none.json()).toMatchObject({ roles: [], changed: true });
      expect(await audits()).toHaveLength(3);
    });

    it('lets an admin edit a leader’s Roles', async () => {
      const res = await editRoles({
        as: 'ada',
        member: 'pia',
        membership: ws('pia'),
        roleIds: [],
      });
      expect(res.statusCode).toBe(200);
      expect(await heldRoles(ws('pia'))).toEqual([]);
    });

    it('keeps a peer leader’s Roles read-only for another leader', async () => {
      const res = await editRoles({
        as: 'lea',
        member: 'pia',
        membership: ws('pia'),
        roleIds: [f.vocals, f.guitar],
        locale: 'en',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: 'FORBIDDEN',
        message: m.error_forbidden({}, { locale: 'en' }),
      });
      expect(await heldRoles(ws('pia'))).toEqual([f.vocals]);
    });

    it('hides a Ministry the caller only volunteers in or does not lead', async () => {
      // kim leads Kids; Worship is outside their management scope, their own membership included.
      for (const target of ['val', 'kim']) {
        const res = await editRoles({
          as: 'kim',
          member: target,
          membership: ws(target),
          roleIds: [f.vocals, f.guitar],
        });
        expect(res.statusCode, target).toBe(404);
        expect(res.json().error).toBe('NOT_FOUND');
      }
      expect(await audits()).toEqual([]);
    });

    it('refuses a member without People capability before any lookup, and an anonymous caller', async () => {
      for (const membership of [
        ws('val'),
        '00000000-0000-4000-8000-000000000000',
      ]) {
        const res = await editRoles({
          as: 'ord',
          member: 'val',
          membership,
          roleIds: [f.vocals],
        });
        expect(res.statusCode).toBe(403);
      }
      const anonymous = await editRoles({
        member: 'val',
        membership: ws('val'),
        roleIds: [f.vocals],
      });
      expect(anonymous.statusCode).toBe(401);
    });

    it('answers one 404 for a missing, mismatched, other-Church, ended or retired target', async () => {
      // One active Volunteer profile per User, so Church B has its own member.
      await person({ key: 'bea', church: CHURCH_B });
      const bMinistry = (
        await buildMinistry({ db, churchId: CHURCH_B, name: 'B Kids' })
      ).id;
      const valB = await serves({
        key: 'bea',
        ministryId: bMinistry,
        level: 'volunteer',
        roleIds: [f.foreignRole],
        church: CHURCH_B,
      });
      await person({ key: 'rex' });
      const rex = await buildVolunteer({
        db,
        churchId: CHURCH_A,
        userId: 'rex',
        leftAt: parseInstant({ value: '2026-10-01T00:00:00.000Z' }),
      });
      const retired = (
        await buildMinistryMembership({
          db,
          churchId: CHURCH_A,
          volunteerId: rex.id,
          ministryId: f.worship,
          ministryAccessLevel: 'volunteer',
          roleIds: [f.vocals],
        })
      ).id;
      await person({ key: 'eli' });
      const ended = await serves({
        key: 'eli',
        ministryId: f.worship,
        level: 'volunteer',
        roleIds: [f.vocals],
      });
      await db
        .update(ministryMembership)
        .set({ status: 'inactive', leftAt: new Date('2026-10-01T00:00:00Z') })
        .where(eq(ministryMembership.id, ended));

      const targets = [
        { member: 'val', membership: '00000000-0000-4000-8000-000000000000' },
        { member: 'val', membership: 'not-a-uuid' },
        { member: 'val', membership: ws('pia') },
        { member: 'val', membership: valB },
        { member: 'nobody', membership: ws('val') },
        { member: 'rex', membership: retired },
        { member: 'eli', membership: ended },
      ];
      for (const target of targets) {
        const res = await editRoles({
          as: 'ada',
          ...target,
          roleIds: [f.vocals, f.guitar],
        });
        expect(res.statusCode, JSON.stringify(target)).toBe(404);
        expect(res.json().error).toBe('NOT_FOUND');
      }
      expect(await heldRoles(valB)).toEqual([f.foreignRole]);
      expect(await audits()).toEqual([]);
    });
  });

  describe('the complete Role set', () => {
    it('treats the same set in another order with duplicates as a no-op without an audit', async () => {
      const res = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.keys, f.vocals, f.keys],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ changed: false });
      expect(res.json().roles.map((r: { id: string }) => r.id)).toEqual([
        f.keys,
        f.vocals,
      ]);
      expect(await audits()).toEqual([]);
    });

    it('lets a held archived Role be kept alone, removed, and then never granted again', async () => {
      const keepArchivedOnly = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.keys],
      });
      expect(keepArchivedOnly.statusCode).toBe(200);
      const removeArchived = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.guitar],
      });
      expect(removeArchived.statusCode).toBe(200);
      expect(await heldRoles(valWorship())).toEqual([f.guitar]);

      const regrant = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.guitar, f.keys],
        locale: 'en',
      });
      expect(regrant.statusCode).toBe(422);
      expect(regrant.json()).toEqual({
        error: 'INVALID_MINISTRY_ROLE',
        message: m.error_invalid_ministry_role({}, { locale: 'en' }),
      });
      expect(await heldRoles(valWorship())).toEqual([f.guitar]);
      expect(await audits()).toHaveLength(2);
    });

    it('refuses an archived, other-Ministry, other-Church or unknown Role without naming it', async () => {
      for (const roleId of [
        f.drums,
        f.teacher,
        f.foreignRole,
        '00000000-0000-4000-8000-000000000000',
      ]) {
        const res = await editRoles({
          as: 'ada',
          member: 'val',
          membership: valWorship(),
          roleIds: [f.vocals, f.keys, roleId],
        });
        expect(res.statusCode, roleId).toBe(422);
        expect(Object.keys(res.json()).sort()).toEqual(['error', 'message']);
        expect(res.json().error).toBe('INVALID_MINISTRY_ROLE');
      }
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
      expect(await audits()).toEqual([]);
    });

    it('keeps a volunteer-level member on at least one Role, in the request locale', async () => {
      const res = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [],
        locale: 'pt-BR',
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: 'MINISTRY_ROLE_REQUIRED',
        message: m.error_ministry_role_required({}, { locale: 'pt-BR' }),
      });
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
    });

    it('rejects a malformed body through the validation path', async () => {
      for (const roleIds of [undefined, 'x', ['not-a-uuid'], [42]]) {
        const res = await editRoles({
          as: 'ada',
          member: 'val',
          membership: valWorship(),
          roleIds,
        });
        expect(res.statusCode, JSON.stringify(roleIds)).toBe(422);
        expect(res.json().error).toBe('VALIDATION_ERROR');
      }
      expect(await audits()).toEqual([]);
    });
  });

  describe('the upcoming-Assignment guard', () => {
    it('refuses removing used Roles with every unique blocker, ordered by Shift start, and changes nothing', async () => {
      const later = await service({
        roleId: f.vocals,
        title: 'Culto',
        eventStart: '2026-11-15T10:00:00.000Z',
        eventEnd: '2026-11-15T12:00:00.000Z',
        status: 'draft',
      });
      const archivedRole = await service({
        roleId: f.keys,
        title: 'Ensaio',
        eventStart: '2026-11-10T19:00:00.000Z',
        eventEnd: '2026-11-10T21:00:00.000Z',
        status: 'confirmed',
      });
      // A running multi-day Event protects its already-ended Shift.
      const running = await service({
        roleId: f.vocals,
        title: 'Retiro',
        eventStart: '2026-11-02T08:00:00.000Z',
        eventEnd: '2026-11-04T18:00:00.000Z',
        shiftStart: '2026-11-02T08:00:00.000Z',
        shiftEnd: '2026-11-02T12:00:00.000Z',
      });
      const notBlocking: ServiceInput[] = [
        // Ends exactly now: past.
        {
          roleId: f.vocals,
          title: 'Manhã',
          eventStart: '2026-11-03T09:00:00.000Z',
          eventEnd: NOW,
        },
        {
          roleId: f.vocals,
          title: 'Ontem',
          eventStart: '2026-11-02T09:00:00.000Z',
          eventEnd: '2026-11-02T11:00:00.000Z',
        },
        {
          roleId: f.vocals,
          title: 'Recusada',
          eventStart: '2026-11-20T09:00:00.000Z',
          eventEnd: '2026-11-20T11:00:00.000Z',
          status: 'declined',
        },
        {
          roleId: f.vocals,
          title: 'Retirada',
          eventStart: '2026-11-21T09:00:00.000Z',
          eventEnd: '2026-11-21T11:00:00.000Z',
          status: 'cancelled',
        },
        {
          roleId: f.vocals,
          title: 'Cancelado',
          eventStart: '2026-11-22T09:00:00.000Z',
          eventEnd: '2026-11-22T11:00:00.000Z',
          eventStatus: 'cancelled',
        },
        // Another Volunteer's Assignment for the same Role.
        {
          key: 'pia',
          roleId: f.vocals,
          title: 'Outro',
          eventStart: '2026-11-23T09:00:00.000Z',
          eventEnd: '2026-11-23T11:00:00.000Z',
        },
      ];
      for (const input of notBlocking) await service(input);

      const res = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.guitar],
        locale: 'en',
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: 'UPCOMING_ASSIGNMENTS',
        message: m.error_upcoming_assignments({}, { locale: 'en' }),
        assignments: [
          { ...running, roleName: 'Vocals' },
          { ...archivedRole, roleName: 'Keys' },
          { ...later, roleName: 'Vocals' },
        ],
      });
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
      expect(await audits()).toEqual([]);
    });

    it('allows additions and removals of unused Roles beside an Assignment on an unchanged Role', async () => {
      await service({
        roleId: f.vocals,
        title: 'Culto',
        eventStart: '2026-11-15T10:00:00.000Z',
        eventEnd: '2026-11-15T12:00:00.000Z',
      });

      const res = await editRoles({
        as: 'lea',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.vocals, f.guitar],
      });

      expect(res.statusCode).toBe(200);
      expect(await heldRoles(valWorship())).toEqual(
        [f.vocals, f.guitar].sort(),
      );
    });
  });

  it('rolls the Role change back when its audit cannot be written', async () => {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION test_fail_roles_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$
    `);
    await db.execute(sql`
      CREATE TRIGGER test_fail_roles_audit BEFORE INSERT ON identity_audit
      FOR EACH ROW WHEN (NEW.action = 'ministry_roles_changed')
      EXECUTE FUNCTION test_fail_roles_audit()
    `);
    try {
      const res = await editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.guitar],
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe('INTERNAL_SERVER_ERROR');
    } finally {
      await db.execute(
        sql`DROP TRIGGER test_fail_roles_audit ON identity_audit`,
      );
      await db.execute(sql`DROP FUNCTION test_fail_roles_audit()`);
    }
    expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
    expect(await audits()).toEqual([]);
  });

  describe('when writes overlap', () => {
    interface HolderInput {
      /** Run while the holder keeps its locks; each started request must reach a lock before the next. */
      steps: (() => Promise<unknown>)[];
      lock: string;
    }

    /**
     * Holds a row lock from outside the app and starts each step only after
     * the previous one waits on a lock, so the queue order is the step order.
     */
    async function holding({ steps, lock }: HolderInput) {
      const holder = new pg.Client({
        connectionString: getIntegrationDatabaseUrl(),
      });
      await holder.connect();
      try {
        await holder.query('BEGIN');
        await holder.query(lock);
        const pending: Promise<unknown>[] = [];
        for (const step of steps) {
          pending.push(step());
          await waitForLockWaiters({ holder, count: pending.length });
        }
        await holder.query('COMMIT');
        return await Promise.all(pending);
      } finally {
        await holder.end();
      }
    }

    interface WaitForLockWaitersInput {
      holder: pg.Client;
      count: number;
    }

    async function waitForLockWaiters({
      holder,
      count,
    }: WaitForLockWaitersInput) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await holder.query('SELECT pg_stat_clear_snapshot()');
        const { rows } = await holder.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        if (rows[0].waiting >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`fewer than ${count} requests reached a lock`);
    }

    const lockMembership = () =>
      `SELECT id FROM ministry_membership WHERE id = '${valWorship()}' FOR NO KEY UPDATE`;
    const lockChurch = `SELECT id FROM church WHERE id = '${CHURCH_A}' FOR NO KEY UPDATE`;

    interface AssignInput {
      shiftId: string;
      shiftRequirementId: string;
    }

    const assignVal = ({ shiftId, shiftRequirementId }: AssignInput) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/assign/shifts/${shiftId}/assignments`,
        headers: { [USER_HEADER]: 'lea' },
        payload: {
          volunteerId: volunteers.get(`val:${CHURCH_A}`),
          shiftRequirementId,
        },
      });

    const culto = () =>
      openShift({
        roleId: f.vocals,
        title: 'Culto',
        eventStart: '2026-11-15T10:00:00.000Z',
        eventEnd: '2026-11-15T12:00:00.000Z',
      });

    const dropVocals = () =>
      editRoles({
        as: 'ada',
        member: 'val',
        membership: valWorship(),
        roleIds: [f.keys],
      });

    it('serializes concurrent Role edits so each audit starts from the previous result', async () => {
      const [first, second] = (await holding({
        lock: lockChurch,
        steps: [
          () =>
            editRoles({
              as: 'ada',
              member: 'val',
              membership: valWorship(),
              roleIds: [f.vocals, f.keys, f.guitar],
            }),
          () =>
            editRoles({
              as: 'lea',
              member: 'val',
              membership: valWorship(),
              roleIds: [f.vocals],
            }),
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect([first?.statusCode, second?.statusCode]).toEqual([200, 200]);
      // lea's complete set wins as the later write: guitar and keys removed.
      expect(await heldRoles(valWorship())).toEqual([f.vocals]);
      const rows = await audits();
      const [ada, lea] = [
        rows.find((row) => row.actorId === 'ada'),
        rows.find((row) => row.actorId === 'lea'),
      ];
      expect(lea?.details).toMatchObject({
        beforeRoleIds: (ada?.details as { afterRoleIds: string[] })
          .afterRoleIds,
        afterRoleIds: [f.vocals],
      });
    });

    it('refuses the removal when an Assignment needing the Role commits first', async () => {
      const { shift, requirement } = await culto();

      const [created, edited] = (await holding({
        lock: lockMembership(),
        steps: [
          () =>
            assignVal({
              shiftId: shift.id,
              shiftRequirementId: requirement.id,
            }),
          dropVocals,
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect(created?.statusCode).toBe(201);
      expect(created?.json().warnings).toEqual([]);
      expect(edited?.statusCode).toBe(409);
      expect(edited?.json().assignments).toEqual([
        expect.objectContaining({
          assignmentId: created?.json().assignment.id,
          roleId: f.vocals,
        }),
      ]);
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
    });

    it('rechecks qualification after the removal commits first, so the Assignment is no longer qualified', async () => {
      const { shift, requirement } = await culto();

      const [edited, created] = (await holding({
        lock: lockMembership(),
        steps: [
          dropVocals,
          () =>
            assignVal({
              shiftId: shift.id,
              shiftRequirementId: requirement.id,
            }),
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect(edited?.statusCode).toBe(200);
      expect(await heldRoles(valWorship())).toEqual([f.keys]);
      // An unqualified placement is the Assign board's warned override, never a silent qualified one.
      expect(created?.statusCode).toBe(201);
      expect(created?.json().warnings).toEqual([
        expect.objectContaining({ type: 'NOT_QUALIFIED' }),
      ]);
    });

    it('refuses the removal when a reassignment to the Volunteer commits first', async () => {
      const kimsTurn = await service({
        key: 'kim',
        roleId: f.vocals,
        title: 'Culto',
        eventStart: '2026-11-15T10:00:00.000Z',
        eventEnd: '2026-11-15T12:00:00.000Z',
      });

      const [reassigned, edited] = (await holding({
        lock: lockMembership(),
        steps: [
          () =>
            app.inject({
              method: 'PATCH',
              url: `/api/v1/assign/assignments/${kimsTurn.assignmentId}/reassign`,
              headers: { [USER_HEADER]: 'lea' },
              payload: { volunteerId: volunteers.get(`val:${CHURCH_A}`) },
            }),
          dropVocals,
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect(reassigned?.statusCode).toBe(200);
      expect(edited?.statusCode).toBe(409);
      expect(edited?.json().assignments).toHaveLength(1);
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
    });

    it('never grants a Role a concurrent archive retired first, and keeps one granted first as a held archived Role', async () => {
      const archiveGuitar = () =>
        roleManager.archive({
          churchId: ChurchId.from(CHURCH_A),
          ministryId: MinistryId.from(f.worship),
          roleId: RoleId.from(f.guitar),
        });
      const grantGuitar = () =>
        editRoles({
          as: 'ada',
          member: 'val',
          membership: valWorship(),
          roleIds: [f.vocals, f.keys, f.guitar],
        });
      const lockGuitar = `SELECT id FROM role WHERE id = '${f.guitar}' FOR UPDATE`;

      const [, refused] = (await holding({
        lock: lockGuitar,
        steps: [archiveGuitar, grantGuitar],
      })) as Awaited<ReturnType<typeof editRoles>>[];
      expect(refused?.statusCode).toBe(422);
      expect(refused?.json().error).toBe('INVALID_MINISTRY_ROLE');
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());

      // kim's guitar Role is a fresh active one granted before its archive.
      const piano = (
        await buildRole({
          db,
          churchId: CHURCH_A,
          ministryId: f.worship,
          name: 'Piano',
        })
      ).id;
      const [granted] = (await holding({
        lock: `SELECT id FROM role WHERE id = '${piano}' FOR UPDATE`,
        steps: [
          () =>
            editRoles({
              as: 'ada',
              member: 'val',
              membership: valWorship(),
              roleIds: [f.vocals, f.keys, piano],
            }),
          () =>
            roleManager.archive({
              churchId: ChurchId.from(CHURCH_A),
              ministryId: MinistryId.from(f.worship),
              roleId: RoleId.from(piano),
            }),
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];
      expect(granted?.statusCode).toBe(200);
      const [archived] = await db
        .select({ archivedAt: role.archivedAt })
        .from(role)
        .where(and(eq(role.id, piano)));
      expect(archived?.archivedAt).not.toBeNull();
      expect(await heldRoles(valWorship())).toContain(piano);
    });

    it('stops a leader whose leadership ended while their edit waited', async () => {
      const [, edited] = (await holding({
        lock: lockChurch,
        steps: [
          // Stands in for a level change: the same Church lock, then the demotion.
          async () => {
            const client = new pg.Client({
              connectionString: getIntegrationDatabaseUrl(),
            });
            await client.connect();
            try {
              await client.query('BEGIN');
              await client.query(lockChurch);
              await client.query(
                `UPDATE ministry_membership SET ministry_access_level = 'volunteer' WHERE id = $1`,
                [memberships.get(`lea:${f.worship}`)],
              );
              await client.query('COMMIT');
            } finally {
              await client.end();
            }
          },
          () =>
            editRoles({
              as: 'lea',
              member: 'val',
              membership: valWorship(),
              roleIds: [f.vocals, f.keys, f.guitar],
            }),
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect(edited?.statusCode).toBe(404);
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
      expect(await audits()).toEqual([]);
    });

    it('stops an admin whose Church access was removed while their change waited', async () => {
      await person({ key: 'ben', access: 'admin' });
      const [demoted, changed] = (await holding({
        lock: lockChurch,
        steps: [
          () =>
            app.inject({
              method: 'PATCH',
              url: `/api/v1/people/${memberId('ben')}/church-access`,
              headers: { [USER_HEADER]: 'ada' },
              payload: { accessLevel: 'member' },
            }),
          () =>
            changeAccess({
              as: 'ben',
              member: 'val',
              membership: valWorship(),
              accessLevel: 'leader',
            }),
        ],
      })) as Awaited<ReturnType<typeof changeAccess>>[];

      expect(demoted?.statusCode).toBe(200);
      expect(changed?.statusCode).toBe(404);
      expect(await levelOf(valWorship())).toBe('volunteer');
    });

    it('stops an admin whose Church access was removed while their edit waited', async () => {
      await person({ key: 'ben', access: 'admin' });
      const [demoted, edited] = (await holding({
        lock: lockChurch,
        steps: [
          () =>
            app.inject({
              method: 'PATCH',
              url: `/api/v1/people/${memberId('ben')}/church-access`,
              headers: { [USER_HEADER]: 'ada' },
              payload: { accessLevel: 'member' },
            }),
          () =>
            editRoles({
              as: 'ben',
              member: 'val',
              membership: valWorship(),
              roleIds: [f.vocals, f.keys, f.guitar],
            }),
        ],
      })) as Awaited<ReturnType<typeof editRoles>>[];

      expect(demoted?.statusCode).toBe(200);
      expect(edited?.statusCode).toBe(404);
      expect(await heldRoles(valWorship())).toEqual([f.vocals, f.keys].sort());
    });
  });
});

describe('GET /people/:memberId Edit Roles hints', () => {
  interface HintsInput {
    as: string;
    target: string;
  }

  async function hints({ as, target }: HintsInput) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${memberId(target)}`,
      headers: { [USER_HEADER]: as },
    });
    expect(res.statusCode).toBe(200);
    return Object.fromEntries(
      res
        .json()
        .ministries.map(
          (card: { ministryName: string; canEditRoles: boolean }) => [
            card.ministryName,
            card.canEditRoles,
          ],
        ),
    );
  }

  it('shows the level hint to admins only', async () => {
    const level = async (as: string, target: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/people/${memberId(target)}`,
          headers: { [USER_HEADER]: as },
        })
      )
        .json()
        .ministries.map(
          (c: { canChangeMinistryAccess: boolean }) =>
            c.canChangeMinistryAccess,
        );
    expect(await level('ada', 'kim')).toEqual([true, true]);
    expect(await level('lea', 'val')).toEqual([false]);
    expect(await level('lea', 'lea')).toEqual([false]);
  });

  it('derives each card’s hint from the same target-aware rules as the mutation', async () => {
    expect(await hints({ as: 'ada', target: 'kim' })).toEqual({
      Kids: true,
      Worship: true,
    });
    expect(await hints({ as: 'ada', target: 'pia' })).toEqual({
      Worship: true,
    });
    expect(await hints({ as: 'lea', target: 'val' })).toEqual({
      Worship: true,
    });
    expect(await hints({ as: 'lea', target: 'lea' })).toEqual({
      Worship: true,
    });
    expect(await hints({ as: 'lea', target: 'pia' })).toEqual({
      Worship: false,
    });
    // kim leads only Kids, so only that card is visible, and it is their own.
    expect(await hints({ as: 'kim', target: 'kim' })).toEqual({ Kids: true });
  });
});

interface ChangeAccessInput {
  as?: string;
  member: string;
  membership: string;
  accessLevel: unknown;
  roleIds?: unknown;
  locale?: string;
}

function changeAccess({
  as,
  member,
  membership,
  accessLevel,
  roleIds,
  locale,
}: ChangeAccessInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/people/${memberId(member)}/ministry-memberships/${membership}/access`,
    headers: as ? { [USER_HEADER]: as } : {},
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
    payload: roleIds === undefined ? { accessLevel } : { accessLevel, roleIds },
  });
}

const levelOf = async (membershipId: string) =>
  (
    await db
      .select({ level: ministryMembership.ministryAccessLevel })
      .from(ministryMembership)
      .where(eq(ministryMembership.id, membershipId))
  )[0]?.level;

describe('PATCH /people/:memberId/ministry-memberships/:membershipId/access', () => {
  const ws = (key: string) => memberships.get(`${key}:${f.worship}`) ?? '';

  it('lets an admin without a Volunteer profile promote a volunteer, keeping Roles and recording one audit', async () => {
    const res = await changeAccess({
      as: 'ada',
      member: 'val',
      membership: ws('val'),
      accessLevel: 'leader',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      memberId: memberId('val'),
      membershipId: ws('val'),
      ministryAccessLevel: 'leader',
      roles: [
        { id: f.keys, name: 'Keys', archived: true },
        { id: f.vocals, name: 'Vocals', archived: false },
      ],
      changed: true,
    });
    expect(await heldRoles(ws('val'))).toEqual([f.vocals, f.keys].sort());
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      churchId: CHURCH_A,
      actorId: 'ada',
      subjectId: 'val',
      action: 'ministry_access_changed',
      details: {
        churchMembershipId: memberId('val'),
        ministryMembershipId: ws('val'),
        ministryId: f.worship,
        beforeAccessLevel: 'volunteer',
        afterAccessLevel: 'leader',
      },
      timestamp: new Date(NOW),
    });
    expect(rows[0]?.correlationId.length).toBeGreaterThan(0);
  });

  it('demotes a zero-Role leader only with an active Role, in one audit holding both facts', async () => {
    const refused = await changeAccess({
      as: 'ada',
      member: 'lea',
      membership: ws('lea'),
      accessLevel: 'volunteer',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('MINISTRY_ROLE_REQUIRED');
    expect(await levelOf(ws('lea'))).toBe('leader');
    expect(await audits()).toEqual([]);

    const res = await changeAccess({
      as: 'ada',
      member: 'lea',
      membership: ws('lea'),
      accessLevel: 'volunteer',
      roleIds: [f.guitar],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ministryAccessLevel: 'volunteer',
      roles: [{ id: f.guitar, name: 'Guitar', archived: false }],
      changed: true,
    });
    const rows = await audits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'ministry_access_changed',
      details: {
        beforeAccessLevel: 'leader',
        afterAccessLevel: 'volunteer',
        beforeRoleIds: [],
        afterRoleIds: [f.guitar],
      },
    });
  });

  it('refuses a non-admin before any target lookup and hides foreign or mismatched targets from admins', async () => {
    for (const as of ['lea', 'val', 'ord']) {
      for (const membership of [
        ws('val'),
        '00000000-0000-4000-8000-000000000000',
      ]) {
        const res = await changeAccess({
          as,
          member: 'val',
          membership,
          accessLevel: 'leader',
        });
        expect(res.statusCode, `${as} ${membership}`).toBe(403);
      }
    }
    expect(
      (
        await changeAccess({
          member: 'val',
          membership: ws('val'),
          accessLevel: 'leader',
        })
      ).statusCode,
    ).toBe(401);
    // A membership of another person, a missing one and a non-uuid all read as 404 to an admin.
    for (const membership of [
      ws('pia'),
      '00000000-0000-4000-8000-000000000000',
      'nope',
    ]) {
      const res = await changeAccess({
        as: 'ada',
        member: 'val',
        membership,
        accessLevel: 'leader',
      });
      expect(res.statusCode, membership).toBe(404);
    }
    expect(await levelOf(ws('val'))).toBe('volunteer');
    expect(await audits()).toEqual([]);
  });

  it('answers the same state with changed:false and no audit', async () => {
    for (const [member, accessLevel, roleIds] of [
      ['lea', 'leader', undefined],
      ['val', 'volunteer', [f.keys, f.vocals, f.vocals]],
    ] as const) {
      const res = await changeAccess({
        as: 'ada',
        member,
        membership: ws(member),
        accessLevel,
        roleIds,
      });
      expect(res.statusCode, member).toBe(200);
      expect(res.json().changed).toBe(false);
    }
    expect(await audits()).toEqual([]);
  });

  it('lets the last leader of a Ministry be demoted, leaving other memberships and Church access alone', async () => {
    const res = await changeAccess({
      as: 'ada',
      member: 'kim',
      membership: memberships.get(`kim:${f.kids}`) ?? '',
      accessLevel: 'volunteer',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roles).toEqual([
      { id: f.teacher, name: 'Teacher', archived: false },
    ]);
    expect(await levelOf(ws('kim'))).toBe('volunteer');
    expect(await heldRoles(ws('kim'))).toEqual([f.guitar]);
  });

  it('needs an active Role to demote onto, not merely a held archived one', async () => {
    await person({ key: 'arc' });
    await serves({
      key: 'arc',
      ministryId: f.worship,
      level: 'leader',
      roleIds: [f.drums],
    });
    const refused = await changeAccess({
      as: 'ada',
      member: 'arc',
      membership: ws('arc'),
      accessLevel: 'volunteer',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('MINISTRY_ROLE_REQUIRED');
    expect(await levelOf(ws('arc'))).toBe('leader');

    const ok = await changeAccess({
      as: 'ada',
      member: 'arc',
      membership: ws('arc'),
      accessLevel: 'volunteer',
      roleIds: [f.drums, f.guitar],
    });
    expect(ok.statusCode).toBe(200);
  });

  it('refuses an invalid Role selection without changing the level or Roles', async () => {
    for (const roleId of [
      f.drums,
      f.teacher,
      f.foreignRole,
      crypto.randomUUID(),
    ]) {
      const res = await changeAccess({
        as: 'ada',
        member: 'lea',
        membership: ws('lea'),
        accessLevel: 'volunteer',
        roleIds: [roleId],
      });
      expect(res.statusCode, roleId).toBe(422);
      expect(res.json().error).toBe('INVALID_MINISTRY_ROLE');
    }
    expect(await levelOf(ws('lea'))).toBe('leader');
    expect(await heldRoles(ws('lea'))).toEqual([]);
    expect(await audits()).toEqual([]);
  });

  describe('with an upcoming Assignment', () => {
    const upcoming = () =>
      service({
        roleId: f.vocals,
        title: 'Culto',
        eventStart: '2026-11-15T10:00:00.000Z',
        eventEnd: '2026-11-15T12:00:00.000Z',
      });

    it('never blocks a level-only change merely because of the Assignment', async () => {
      await upcoming();
      const res = await changeAccess({
        as: 'ada',
        member: 'val',
        membership: ws('val'),
        accessLevel: 'leader',
      });
      expect(res.statusCode).toBe(200);
      expect(await levelOf(ws('val'))).toBe('leader');
    });

    it('refuses the whole level and Role operation with every blocker when a needed Role is removed', async () => {
      const blocker = await upcoming();
      const res = await changeAccess({
        as: 'ada',
        member: 'val',
        membership: ws('val'),
        accessLevel: 'leader',
        roleIds: [f.keys, f.guitar],
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        error: 'UPCOMING_ASSIGNMENTS',
        assignments: [{ ...blocker, roleName: 'Vocals' }],
      });
      expect(await levelOf(ws('val'))).toBe('volunteer');
      expect(await heldRoles(ws('val'))).toEqual([f.vocals, f.keys].sort());
      expect(await audits()).toEqual([]);
    });
  });

  it('rolls the level and Roles back together when the audit cannot be written', async () => {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION test_fail_access_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$
    `);
    await db.execute(sql`
      CREATE TRIGGER test_fail_access_audit BEFORE INSERT ON identity_audit
      FOR EACH ROW WHEN (NEW.action = 'ministry_access_changed')
      EXECUTE FUNCTION test_fail_access_audit()
    `);
    try {
      const res = await changeAccess({
        as: 'ada',
        member: 'val',
        membership: ws('val'),
        accessLevel: 'leader',
        roleIds: [f.guitar],
      });
      expect(res.statusCode).toBe(500);
    } finally {
      await db.execute(
        sql`DROP TRIGGER test_fail_access_audit ON identity_audit`,
      );
      await db.execute(sql`DROP FUNCTION test_fail_access_audit()`);
    }
    expect(await levelOf(ws('val'))).toBe('volunteer');
    expect(await heldRoles(ws('val'))).toEqual([f.vocals, f.keys].sort());
    expect(await audits()).toEqual([]);
  });

  it('applies authority at once: a promoted volunteer can manage others, a demoted leader cannot', async () => {
    const edit = (as: string) =>
      editRoles({
        as,
        member: 'kim',
        membership: ws('kim'),
        roleIds: [f.guitar, f.vocals],
      });
    expect((await edit('val')).statusCode).toBe(403);
    await changeAccess({
      as: 'ada',
      member: 'val',
      membership: ws('val'),
      accessLevel: 'leader',
    });
    expect((await edit('val')).statusCode).toBe(200);
    await changeAccess({
      as: 'ada',
      member: 'pia',
      membership: ws('pia'),
      accessLevel: 'volunteer',
    });
    expect((await edit('pia')).statusCode).toBe(403);
  });
});
