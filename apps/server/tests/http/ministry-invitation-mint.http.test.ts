import { randomUUID } from 'node:crypto';
import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
  role,
} from '@church/db';
import {
  addMilliseconds,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
import { and, eq, sql } from 'drizzle-orm';
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
import { MinistryController } from '@/api/controllers/ministry-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);
const activeChurchResolver = { resolve: vi.fn() };

const db = schedulingTestDb;
const CHURCH_A = '91111111-1111-4111-8111-111111111111';
const CHURCH_B = '92222222-2222-4222-8222-222222222222';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const DAY_MS = 24 * 60 * 60_000;

type Persona =
  | 'admin'
  | 'worshipLeader'
  | 'adminLeader'
  | 'memberNoVolunteer'
  | 'worshipVolunteer'
  | 'formerWorshipVolunteer'
  | 'foreignUser';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const harness = createMinistryInvitationTestHarness({ db });
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories and AuthorityService; only session and Active Church are seams.
  const controller = new MinistryController({
    ministryManager: {} as never,
    ministryInvitationManager: harness.manager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: harness.authorityManager }),
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
  setTestClock({ instant: NOW });
  await resetSchedulingPhase3Db();
  await seed();
});

afterEach(() => resetClock());

interface Fixture {
  userIds: Record<Persona, string>;
  volunteerIds: Partial<Record<Persona, string>>;
  worshipId: string;
  kidsId: string;
  archivedMinistryId: string;
  foreignMinistryId: string;
  singerId: string;
  drumsId: string;
  archivedRoleId: string;
  kidsRoleId: string;
}
let fx: Fixture;

interface PersonaInput {
  key: Persona;
  churchAccess: 'admin' | 'member';
  memberships?: {
    ministryId: string;
    level: 'leader' | 'volunteer';
    status?: 'active' | 'inactive';
  }[];
  churchId?: string;
}

async function persona({
  key,
  churchAccess,
  memberships = [],
  churchId = CHURCH_A,
}: PersonaInput) {
  const userId = `mint-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@mint.test` });
  await buildChurchMembership({
    db,
    churchId,
    userId,
    accessLevel: churchAccess,
  });
  if (memberships.length === 0) return { userId };
  const volunteer = await buildVolunteer({ db, churchId, userId });
  for (const membership of memberships) {
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId: volunteer.id,
      ministryId: membership.ministryId,
      ministryAccessLevel: membership.level,
      status: membership.status,
      roleIds: [],
    });
  }
  return { userId, volunteerId: volunteer.id };
}

async function seed() {
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'mint-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'mint-b',
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
  const foreign = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  const roleIn = (ministryId: string, name: string) =>
    buildRole({ db, churchId: CHURCH_A, ministryId, name });
  const singer = await roleIn(worship.id, 'Singer');
  const drums = await roleIn(worship.id, 'Drums');
  const archivedRole = await roleIn(worship.id, 'Old Singer');
  await db
    .update(role)
    .set({ archivedAt: new Date() })
    .where(eq(role.id, archivedRole.id));
  const kidsRole = await roleIn(kids.id, 'Helper');

  const admin = await persona({ key: 'admin', churchAccess: 'admin' });
  const worshipLeader = await persona({
    key: 'worshipLeader',
    churchAccess: 'member',
    memberships: [{ ministryId: worship.id, level: 'leader' }],
  });
  const adminLeader = await persona({
    key: 'adminLeader',
    churchAccess: 'admin',
    memberships: [{ ministryId: worship.id, level: 'leader' }],
  });
  const memberNoVolunteer = await persona({
    key: 'memberNoVolunteer',
    churchAccess: 'member',
  });
  const worshipVolunteer = await persona({
    key: 'worshipVolunteer',
    churchAccess: 'member',
    memberships: [{ ministryId: worship.id, level: 'volunteer' }],
  });
  const formerWorshipVolunteer = await persona({
    key: 'formerWorshipVolunteer',
    churchAccess: 'member',
    memberships: [
      { ministryId: worship.id, level: 'volunteer', status: 'inactive' },
    ],
  });
  const foreignUser = await persona({
    key: 'foreignUser',
    churchAccess: 'member',
    churchId: CHURCH_B,
  });
  fx = {
    userIds: {
      admin: admin.userId,
      worshipLeader: worshipLeader.userId,
      adminLeader: adminLeader.userId,
      memberNoVolunteer: memberNoVolunteer.userId,
      worshipVolunteer: worshipVolunteer.userId,
      formerWorshipVolunteer: formerWorshipVolunteer.userId,
      foreignUser: foreignUser.userId,
    },
    volunteerIds: {
      worshipLeader: worshipLeader.volunteerId,
      adminLeader: adminLeader.volunteerId,
    },
    worshipId: worship.id,
    kidsId: kids.id,
    archivedMinistryId: archivedMinistry.id,
    foreignMinistryId: foreign.id,
    singerId: singer.id,
    drumsId: drums.id,
    archivedRoleId: archivedRole.id,
    kidsRoleId: kidsRole.id,
  };
}

function signIn(key: Persona) {
  mockGetSession.mockResolvedValue({
    user: { id: fx.userIds[key] },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: fx.volunteerIds[key] ?? null,
    autoSelected: false,
  });
}

interface MintBody {
  email: string;
  ministryAccessLevel: 'leader' | 'volunteer';
  roleIds: string[];
}

function mint(ministryId: string, body: MintBody) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/invitations`,
    payload: body,
  });
}

const volunteerOffer = (email: string, roleIds = [fx.singerId]): MintBody => ({
  email,
  ministryAccessLevel: 'volunteer',
  roleIds,
});

/** Everything a refusal must leave untouched. */
async function snapshot() {
  const ministryRows = await db
    .select()
    .from(ministryInvitation)
    .orderBy(ministryInvitation.id);
  const churchRows = await db
    .select()
    .from(churchInvitation)
    .orderBy(churchInvitation.id);
  const roleRows = await db
    .select()
    .from(ministryInvitationRole)
    .orderBy(ministryInvitationRole.id);
  const outboxRows = await db
    .select({ id: outboxMessage.id })
    .from(outboxMessage)
    .orderBy(outboxMessage.id);
  return { ministryRows, churchRows, roleRows, outboxRows };
}

async function outboxKinds() {
  const rows = await db
    .select({ kind: outboxMessage.kind, payload: outboxMessage.payload })
    .from(outboxMessage);
  return rows;
}

describe('POST /ministries/:ministryId/invitations — delivery by recipient', () => {
  it('pairs a new address with one member Church offer, one T1 and no N1, stored lower-cased', async () => {
    signIn('admin');
    const res = await mint(fx.worshipId, {
      email: '  New.Person@Mint.TEST ',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'chained', status: 'pending' });
    const churchRows = await db.select().from(churchInvitation);
    expect(churchRows).toEqual([
      expect.objectContaining({
        email: 'new.person@mint.test',
        role: 'member',
        status: 'pending',
      }),
    ]);
    const outbox = await outboxKinds();
    expect(outbox.map((row) => row.kind)).toEqual(['invitation.chained']);
  });

  it('treats a User of another Church as new to this Church (T1, no N1)', async () => {
    signIn('admin');
    const res = await mint(
      fx.worshipId,
      volunteerOffer('FOREIGNUSER@mint.test'),
    );

    expect(res.statusCode).toBe(201);
    expect(res.json().kind).toBe('chained');
    expect((await outboxKinds()).map((row) => row.kind)).toEqual([
      'invitation.chained',
    ]);
  });

  it('addresses an existing Church Member without a Volunteer profile by N1 only, matching email case-insensitively', async () => {
    signIn('admin');
    const res = await mint(
      fx.worshipId,
      volunteerOffer('MemberNoVolunteer@MINT.test', [
        fx.singerId,
        fx.singerId,
        fx.drumsId,
      ]),
    );

    expect(res.statusCode).toBe(201);
    expect(res.json().kind).toBe('ministry-only');
    expect(await db.select().from(churchInvitation)).toEqual([]);
    const [offer] = await db.select().from(ministryInvitation);
    expect(offer?.inviteeUserId).toBe(fx.userIds.memberNoVolunteer);
    const roles = await db.select().from(ministryInvitationRole);
    expect(roles.map((row) => row.roleId).sort()).toEqual(
      [fx.singerId, fx.drumsId].sort(),
    );
    const outbox = await outboxKinds();
    expect(outbox).toEqual([
      expect.objectContaining({
        kind: 'notification',
        payload: expect.objectContaining({
          kind: 'ministry_invitation',
          to: { userId: fx.userIds.memberNoVolunteer, churchId: CHURCH_A },
        }),
      }),
    ]);
  });
});

describe('POST /ministries/:ministryId/invitations — authority and validation', () => {
  it('lets a leader invite a Volunteer into their own Ministry', async () => {
    signIn('worshipLeader');
    const res = await mint(fx.worshipId, volunteerOffer('lead-made@mint.test'));
    expect(res.statusCode).toBe(201);
  });

  it('refuses a leader granting leader access with no writes', async () => {
    signIn('worshipLeader');
    const before = await snapshot();
    const res = await mint(fx.worshipId, {
      email: 'would-lead@mint.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('INSUFFICIENT_INVITATION_AUTHORITY');
    expect(await snapshot()).toEqual(before);
  });

  it('gives an admin who also leads admin behavior (leader grant allowed)', async () => {
    signIn('adminLeader');
    const res = await mint(fx.kidsId, {
      email: 'kids-lead@mint.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    expect(res.statusCode).toBe(201);
  });

  it('answers an unmanaged, archived, foreign and missing Ministry with one indistinguishable 404', async () => {
    const bodies: unknown[] = [];
    signIn('worshipLeader');
    for (const ministryId of [fx.kidsId]) {
      const res = await mint(ministryId, volunteerOffer('x@mint.test', []));
      expect(res.statusCode).toBe(404);
      bodies.push(res.json());
    }
    signIn('admin');
    for (const ministryId of [
      fx.archivedMinistryId,
      fx.foreignMinistryId,
      randomUUID(),
    ]) {
      const res = await mint(ministryId, volunteerOffer('x@mint.test', []));
      expect(res.statusCode).toBe(404);
      bodies.push(res.json());
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ error: 'MINISTRY_NOT_FOUND' });
  });

  it.each([
    ['archived', () => fx.archivedRoleId],
    ['another Ministry', () => fx.kidsRoleId],
    ['unknown', () => randomUUID()],
  ])('refuses a %s Role with 422 INVALID_INVITATION_ROLE', async (_label, roleId) => {
    signIn('admin');
    const before = await snapshot();
    const res = await mint(
      fx.worshipId,
      volunteerOffer('bad-role@mint.test', [fx.singerId, roleId()]),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('INVALID_INVITATION_ROLE');
    expect(await snapshot()).toEqual(before);
  });

  it('requires at least one Role at volunteer level but not at leader level', async () => {
    signIn('admin');
    const refused = await mint(
      fx.worshipId,
      volunteerOffer('no-role@mint.test', []),
    );
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason: 'INVITATION_ROLE_REQUIRED',
    });
    expect(await db.select().from(ministryInvitation)).toEqual([]);

    const leader = await mint(fx.kidsId, {
      email: 'no-role@mint.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    expect(leader.statusCode).toBe(201);
  });
});

describe('POST /ministries/:ministryId/invitations — duplicates and membership', () => {
  it.each([
    ['a new address', 'dup@mint.test', 'DUP@Mint.Test'],
    [
      'an existing Church Member',
      'memberNoVolunteer@mint.test',
      'MEMBERNOVOLUNTEER@mint.test',
    ],
  ])('refuses a repeat for %s, expired included, without side effects', async (_label, first, repeat) => {
    signIn('admin');
    const created = await mint(fx.worshipId, volunteerOffer(first));
    expect(created.statusCode).toBe(201);

    setTestClock({
      instant: addMilliseconds({ instant: NOW, milliseconds: 30 * DAY_MS }),
    });
    const before = await snapshot();
    const res = await mint(fx.worshipId, {
      email: repeat,
      ministryAccessLevel: 'leader',
      roleIds: [fx.drumsId],
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'PENDING_MINISTRY_INVITATION_EXISTS',
      existingInvitation: {
        id: created.json().id,
        createdAt: '2026-11-02T12:00:00.000Z',
      },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses an active Ministry member but lets an ended membership rejoin', async () => {
    signIn('admin');
    const active = await mint(
      fx.worshipId,
      volunteerOffer('worshipVolunteer@mint.test'),
    );
    expect(active.statusCode).toBe(409);
    expect(active.json().error).toBe('INVITEE_ALREADY_MINISTRY_MEMBER');

    const former = await mint(
      fx.worshipId,
      volunteerOffer('formerWorshipVolunteer@mint.test'),
    );
    expect(former.statusCode).toBe(201);
  });
});

describe('POST /ministries/:ministryId/invitations — shared Church offer', () => {
  it('reuses one pending Church offer across Ministries and keeps a pending admin offer at admin', async () => {
    signIn('admin');
    await db.insert(churchInvitation).values({
      id: 'admin-offer',
      organizationId: CHURCH_A,
      email: 'future.admin@mint.test',
      role: 'admin',
      status: 'pending',
      expiresAt: new Date('2026-11-05T12:00:00.000Z'),
      inviterId: fx.userIds.admin,
    });

    const worship = await mint(
      fx.worshipId,
      volunteerOffer('Future.Admin@mint.test'),
    );
    const kids = await mint(fx.kidsId, {
      email: 'future.admin@mint.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });

    expect([worship.statusCode, kids.statusCode]).toEqual([201, 201]);
    const churchRows = await db.select().from(churchInvitation);
    expect(churchRows).toEqual([
      expect.objectContaining({
        id: 'admin-offer',
        role: 'admin',
        expiresAt: new Date('2026-11-05T12:00:00.000Z'),
      }),
    ]);
    const halves = await db.select().from(ministryInvitation);
    expect(halves.map((half) => half.churchInvitationId)).toEqual([
      'admin-offer',
      'admin-offer',
    ]);
  });

  it('reissues an expired pending Church offer and aligns every pending half', async () => {
    signIn('admin');
    const first = await mint(fx.worshipId, volunteerOffer('late@mint.test'));
    expect(first.statusCode).toBe(201);
    const [before] = await db.select().from(ministryInvitation);

    const later = addMilliseconds({ instant: NOW, milliseconds: 30 * DAY_MS });
    setTestClock({ instant: later });
    const second = await mint(fx.kidsId, {
      email: 'late@mint.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });

    expect(second.statusCode).toBe(201);
    const [church] = await db.select().from(churchInvitation);
    const expected = new Date('2026-12-09T12:00:00.000Z');
    expect(church?.expiresAt).toEqual(expected);
    const halves = await db.select().from(ministryInvitation);
    expect(halves.map((half) => half.expiresAt)).toEqual([expected, expected]);
    const [sibling] = halves.filter((half) => half.id === before?.id);
    expect(sibling?.resendCount).toBe(before?.resendCount);
    expect(sibling?.ministryAccessLevel).toBe(before?.ministryAccessLevel);
    expect(
      (await outboxKinds()).filter((row) => row.kind === 'invitation.chained'),
    ).toHaveLength(2);
  });
});

describe('POST /ministries/:ministryId/invitations — concurrency', () => {
  it.each([
    ['a new address', 'race@mint.test', 'RACE@mint.test'],
    [
      'an existing Church Member',
      'memberNoVolunteer@mint.test',
      'MemberNoVolunteer@mint.test',
    ],
  ])('yields one offer and one delivery intent for identical requests to %s', async (_label, a, b) => {
    signIn('admin');
    const results = await Promise.all([
      mint(fx.worshipId, volunteerOffer(a)),
      mint(fx.worshipId, volunteerOffer(b)),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(await db.select().from(ministryInvitation)).toHaveLength(1);
    expect(await outboxKinds()).toHaveLength(1);
  });

  it('shares one pending Church offer between concurrent invites into two Ministries', async () => {
    signIn('admin');
    const results = await Promise.all([
      mint(fx.worshipId, volunteerOffer('two-ministries@mint.test')),
      mint(fx.kidsId, {
        email: 'Two-Ministries@mint.test',
        ministryAccessLevel: 'leader',
        roleIds: [],
      }),
    ]);

    expect(results.map((res) => res.statusCode)).toEqual([201, 201]);
    const churchRows = await db
      .select({ id: churchInvitation.id })
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.organizationId, CHURCH_A),
          eq(sql`lower(${churchInvitation.email})`, 'two-ministries@mint.test'),
        ),
      );
    expect(churchRows).toHaveLength(1);
    expect(await outboxKinds()).toHaveLength(2);
  });
});
