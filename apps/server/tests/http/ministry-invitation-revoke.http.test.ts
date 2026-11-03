import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryMembership,
  outboxMessage,
} from '@church/db';
import {
  addMilliseconds,
  type Instant,
  parseInstant,
  resetClock,
  setTestClock,
  toDate,
} from '@church/time';
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
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { MinistryController } from '@/api/controllers/ministry-controller';
import { DbMinistryInvitationManager } from '@/application/db-ministry-invitation-manager';
import {
  revokeChurchOffer,
  revokeMinistryHalf,
} from '@/application/invitation-revocation';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import { DrizzleRedemptionRepository } from '@/infrastructure/repositories';
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
const CHURCH_A = 'a1111111-1111-4111-8111-111111111111';
const CHURCH_B = 'a2222222-2222-4222-8222-222222222222';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const MINUTE_MS = 60_000;
const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const FUTURE = new Date('2026-11-05T12:00:00.000Z');
const PAST = new Date('2026-10-30T12:00:00.000Z');

type Persona =
  | 'admin'
  | 'adminLeader'
  | 'worshipLeader'
  | 'kidsLeader'
  | 'worshipVolunteer'
  | 'memberNoVolunteer'
  | 'invitee'
  | 'foreignUser';

interface BuildAppInput {
  /** Wraps the real repository, e.g. to inject a persistence failure. */
  wrapRepo?: (
    repo: MinistryInvitationRepository,
  ) => MinistryInvitationRepository;
}

/** Real managers, repositories and AuthorityService; only session and Active Church are seams. */
async function buildApp({ wrapRepo }: BuildAppInput = {}) {
  const harness = createMinistryInvitationTestHarness({ db });
  const manager = wrapRepo
    ? new DbMinistryInvitationManager({
        repo: wrapRepo(harness.ministryInvitationRepository),
        roleRepository: harness.roleRepository,
        ministryRepository: harness.ministryRepository,
        authorityManager: harness.authorityManager,
        unitOfWork: harness.unitOfWork,
        outboxRepository: harness.outboxRepository,
        notifications: harness.notifications,
        config: appConfig,
      })
    : harness.manager;
  const instance = await createFastify({ locale: testLocale });
  const controller = new MinistryController({
    ministryManager: {} as never,
    ministryInvitationManager: manager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: harness.authorityManager }),
  });
  await instance.register(
    async (scoped) => {
      scoped.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await instance.ready();
  return { app: instance, harness };
}

let app: FastifyTypedInstance;
let harness: ReturnType<typeof createMinistryInvitationTestHarness>;

beforeAll(async () => {
  ({ app, harness } = await buildApp());
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
  foreignMinistryId: string;
  singerId: string;
  helperId: string;
}
let fx: Fixture;

interface PersonaInput {
  key: Persona;
  churchAccess: 'admin' | 'member';
  leads?: string[];
  serves?: string[];
  churchId?: string;
}

async function persona({
  key,
  churchAccess,
  leads = [],
  serves = [],
  churchId = CHURCH_A,
}: PersonaInput) {
  const userId = `revoke-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@revoke.test` });
  await buildChurchMembership({
    db,
    churchId,
    userId,
    accessLevel: churchAccess,
  });
  if (leads.length + serves.length === 0) return { userId };
  const volunteer = await buildVolunteer({ db, churchId, userId });
  const memberships = [
    ...leads.map((ministryId) => ({ ministryId, level: 'leader' as const })),
    ...serves.map((ministryId) => ({
      ministryId,
      level: 'volunteer' as const,
    })),
  ];
  for (const { ministryId, level } of memberships) {
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId: volunteer.id,
      ministryId,
      ministryAccessLevel: level,
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
    slug: 'revoke-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'revoke-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const foreign = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'Foreign',
  });
  const singer = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: worship.id,
    name: 'Singer',
  });
  const helper = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: kids.id,
    name: 'Helper',
  });
  const people = {
    admin: await persona({ key: 'admin', churchAccess: 'admin' }),
    adminLeader: await persona({
      key: 'adminLeader',
      churchAccess: 'admin',
      leads: [worship.id],
    }),
    worshipLeader: await persona({
      key: 'worshipLeader',
      churchAccess: 'member',
      leads: [worship.id],
    }),
    kidsLeader: await persona({
      key: 'kidsLeader',
      churchAccess: 'member',
      leads: [kids.id],
    }),
    worshipVolunteer: await persona({
      key: 'worshipVolunteer',
      churchAccess: 'member',
      serves: [worship.id],
    }),
    memberNoVolunteer: await persona({
      key: 'memberNoVolunteer',
      churchAccess: 'member',
    }),
    invitee: await persona({ key: 'invitee', churchAccess: 'member' }),
    foreignUser: await persona({
      key: 'foreignUser',
      churchAccess: 'admin',
      churchId: CHURCH_B,
    }),
  };
  fx = {
    userIds: Object.fromEntries(
      Object.entries(people).map(([key, value]) => [key, value.userId]),
    ) as Record<Persona, string>,
    volunteerIds: Object.fromEntries(
      Object.entries(people).map(([key, value]) => [
        key,
        'volunteerId' in value ? value.volunteerId : undefined,
      ]),
    ),
    worshipId: worship.id,
    kidsId: kids.id,
    foreignMinistryId: foreign.id,
    singerId: singer.id,
    helperId: helper.id,
  };
}

function signIn(key: Persona) {
  mockGetSession.mockResolvedValue({
    user: { id: fx.userIds[key] },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: key === 'foreignUser' ? CHURCH_B : CHURCH_A,
    volunteerId: fx.volunteerIds[key] ?? null,
    autoSelected: false,
  });
}

interface ChurchOfferInput {
  id: string;
  email: string;
  role?: 'admin' | 'member';
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
}

async function churchOffer(input: ChurchOfferInput) {
  await db.insert(churchInvitation).values({
    id: input.id,
    organizationId: CHURCH_A,
    email: input.email,
    role: input.role ?? 'member',
    status: input.status ?? 'pending',
    expiresAt: input.expiresAt ?? FUTURE,
    inviterId: fx.userIds.admin,
    createdAt: CREATED_AT,
  });
}

interface MinistryOfferInput {
  ministryId?: string;
  level?: 'leader' | 'volunteer';
  inviteeUserId?: string;
  churchInvitationId?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
  roleIds?: string[];
  churchId?: string;
  resendCount?: number;
}

async function ministryOffer(input: MinistryOfferInput = {}) {
  const id = randomUUID();
  const churchId = input.churchId ?? CHURCH_A;
  const isPaired = input.churchInvitationId !== undefined;
  await db.insert(ministryInvitation).values({
    id,
    churchId,
    ministryId: input.ministryId ?? fx.worshipId,
    inviteeUserId: isPaired
      ? undefined
      : (input.inviteeUserId ?? fx.userIds.invitee),
    churchInvitationId: input.churchInvitationId,
    ministryAccessLevel: input.level ?? 'volunteer',
    status: input.status ?? 'pending',
    inviterId: fx.userIds.worshipLeader,
    expiresAt: input.expiresAt ?? FUTURE,
    createdAt: CREATED_AT,
    resendCount: input.resendCount ?? 0,
  });
  for (const roleId of input.roleIds ?? []) {
    await db
      .insert(ministryInvitationRole)
      .values({ churchId, ministryInvitationId: id, roleId });
  }
  return id;
}

function post(action: 'revoke' | 'resend', ministryId: string, id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/invitations/${id}/${action}`,
  });
}

function revoke(ministryId: string, id: string) {
  return post('revoke', ministryId, id);
}

async function invitationRow(id: string) {
  const [row] = await db
    .select()
    .from(ministryInvitation)
    .where(eq(ministryInvitation.id, id));
  if (!row) throw new Error(`No Ministry Invitation ${id}`);
  return row;
}

async function churchRow(id: string) {
  const [row] = await db
    .select()
    .from(churchInvitation)
    .where(eq(churchInvitation.id, id));
  if (!row) throw new Error(`No Church Invitation ${id}`);
  return row;
}

async function outboxRows() {
  return db
    .select({
      kind: outboxMessage.kind,
      payload: outboxMessage.payload,
      status: outboxMessage.status,
    })
    .from(outboxMessage)
    .orderBy(outboxMessage.createdAt, outboxMessage.id);
}

/** Everything a refusal must leave untouched. */
async function snapshot() {
  return {
    ministryRows: await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id),
    churchRows: await db
      .select()
      .from(churchInvitation)
      .orderBy(churchInvitation.id),
    roleRows: await db
      .select()
      .from(ministryInvitationRole)
      .orderBy(ministryInvitationRole.id),
    outboxRows: await outboxRows(),
  };
}

function at(offsetMs: number): Instant {
  return addMilliseconds({ instant: NOW, milliseconds: offsetMs });
}

/** Resolves once another connection is queued behind a lock. */
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

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

const MANUAL = 'manual';

/** The revocation facts a manual revoke at `when` by `actor` records. */
function revokedBy(actor: Persona, when: Instant = NOW) {
  return {
    status: 'canceled',
    canceledById: fx.userIds[actor],
    canceledAt: toDate({ instant: when }),
    cancelReason: MANUAL,
  };
}

/** Holds a revocation of `id` open (Church row then Ministry rows locked) until released. */
async function heldRevocation(id: string, churchInvitationId?: string) {
  const locked = gate();
  const release = gate();
  const done = harness.unitOfWork.run(async (tx) => {
    await revokeMinistryHalf({
      repo: harness.ministryInvitationRepository,
      churchId: ChurchId.from(CHURCH_A),
      ministryInvitationId: id,
      churchInvitationId,
      revocation: {
        actorId: UserId.from(fx.userIds.admin),
        at: toDate({ instant: NOW }),
        reason: 'manual',
      },
      tx,
    });
    locked.open();
    await release.opened;
  });
  await locked.opened;
  return { release: release.open, done };
}

describe('POST /ministries/:ministryId/invitations/:invitationId/revoke — authority', () => {
  it('answers 401 without a session', async () => {
    const id = await ministryOffer();
    mockGetSession.mockResolvedValue(null as never);
    const res = await revoke(fx.worshipId, id);
    expect(res.statusCode).toBe(401);
  });

  it('lets a ChurchAdmin without a Volunteer profile revoke, recording who, when and why, keeping the row and Roles and sending nothing', async () => {
    const id = await ministryOffer({ roleIds: [fx.singerId] });
    signIn('admin');

    const res = await revoke(fx.worshipId, id);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(await invitationRow(id)).toMatchObject({
      ...revokedBy('admin'),
      inviterId: fx.userIds.worshipLeader,
      createdAt: CREATED_AT,
      expiresAt: FUTURE,
    });
    const roles = await db
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(eq(ministryInvitationRole.ministryInvitationId, id));
    expect(roles).toEqual([{ roleId: fx.singerId }]);
    expect(await outboxRows()).toEqual([]);
  });

  it.each([
    ['their own volunteer-level invitation', 'worshipLeader', 'volunteer'],
    [
      'a leader-level invitation as an admin who also leads',
      'adminLeader',
      'leader',
    ],
  ] as const)('lets a leader revoke %s', async (_label, key, level) => {
    const id = await ministryOffer({ level });
    signIn(key);
    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);
    expect(await invitationRow(id)).toMatchObject(revokedBy(key));
  });

  it('refuses a leader revoking a leader-level invitation in their own Ministry, with no writes, even once closed', async () => {
    const open = await ministryOffer({ level: 'leader' });
    const closed = await ministryOffer({
      level: 'leader',
      inviteeUserId: fx.userIds.memberNoVolunteer,
      status: 'accepted',
    });
    signIn('worshipLeader');
    const before = await snapshot();

    for (const id of [open, closed]) {
      const res = await revoke(fx.worshipId, id);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('INSUFFICIENT_INVITATION_AUTHORITY');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('answers unmanaged, mismatched, foreign and missing targets with one indistinguishable 404', async () => {
    const worshipOffer = await ministryOffer();
    const kidsOffer = await ministryOffer({ ministryId: fx.kidsId });
    const foreignOffer = await ministryOffer({
      ministryId: fx.foreignMinistryId,
      churchId: CHURCH_B,
      inviteeUserId: fx.userIds.foreignUser,
    });
    const before = await snapshot();

    signIn('kidsLeader');
    const unmanaged = await revoke(fx.worshipId, worshipOffer);
    signIn('admin');
    const responses = [
      unmanaged,
      await revoke(fx.worshipId, kidsOffer),
      await revoke(fx.foreignMinistryId, foreignOffer),
      await revoke(fx.worshipId, foreignOffer),
      await revoke(fx.worshipId, randomUUID()),
      await revoke(fx.worshipId, 'not-a-uuid'),
    ];

    expect(responses.map((res) => res.statusCode)).toEqual(
      Array(responses.length).fill(404),
    );
    expect(new Set(responses.map((res) => res.body)).size).toBe(1);
    expect(unmanaged.json().error).toBe('MINISTRY_NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    'worshipVolunteer',
    'memberNoVolunteer',
  ] as const)('gives a %s no management access', async (key) => {
    const id = await ministryOffer();
    signIn(key);
    const before = await snapshot();
    const res = await revoke(fx.worshipId, id);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST .../revoke — lifecycle', () => {
  it('revokes an expired pending invitation', async () => {
    const id = await ministryOffer({ expiresAt: PAST });
    signIn('admin');
    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);
    expect(await invitationRow(id)).toMatchObject(revokedBy('admin'));
  });

  it.each([
    'accepted',
    'rejected',
    'canceled',
  ] as const)('refuses a visible %s invitation with 409 and no writes', async (status) => {
    const id = await ministryOffer({ status });
    signIn('admin');
    const before = await snapshot();

    const res = await revoke(fx.worshipId, id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a repeated revoke without rewriting the first closure facts', async () => {
    const id = await ministryOffer();
    signIn('admin');
    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);
    setTestClock({
      instant: at(MINUTE_MS),
    });
    signIn('adminLeader');

    const res = await revoke(fx.worshipId, id);

    expect(res.statusCode).toBe(409);
    expect(await invitationRow(id)).toMatchObject(revokedBy('admin'));
  });

  it('leaves an accepted Membership of the invitee untouched', async () => {
    const memberships = () =>
      db
        .select()
        .from(ministryMembership)
        .where(eq(ministryMembership.ministryId, fx.worshipId))
        .orderBy(ministryMembership.id);
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.worshipVolunteer,
      level: 'leader',
    });
    const before = await memberships();
    signIn('admin');

    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);
    expect(await memberships()).toEqual(before);
  });

  it('refuses an invitation in an archived Ministry as not found', async () => {
    const id = await ministryOffer();
    await db
      .update(ministry)
      .set({ deletedAt: toDate({ instant: NOW }) })
      .where(eq(ministry.id, fx.worshipId));
    signIn('admin');
    const before = await snapshot();

    const res = await revoke(fx.worshipId, id);

    expect(res.statusCode).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST .../revoke — shared Church offer', () => {
  it('revokes the Church Invitation with the same facts when its only half is revoked', async () => {
    await churchOffer({ id: 'ci-one', email: 'one@revoke.test' });
    const id = await ministryOffer({ churchInvitationId: 'ci-one' });
    signIn('worshipLeader');

    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);

    expect(await invitationRow(id)).toMatchObject(revokedBy('worshipLeader'));
    expect(await churchRow('ci-one')).toMatchObject(revokedBy('worshipLeader'));
  });

  it('keeps the Church Invitation while another half is pending, then revokes it with the last one', async () => {
    await churchOffer({ id: 'ci-two', email: 'two@revoke.test' });
    const worshipHalf = await ministryOffer({ churchInvitationId: 'ci-two' });
    const kidsHalf = await ministryOffer({
      churchInvitationId: 'ci-two',
      ministryId: fx.kidsId,
    });
    signIn('admin');

    expect((await revoke(fx.worshipId, worshipHalf)).statusCode).toBe(204);
    expect(await churchRow('ci-two')).toMatchObject({
      status: 'pending',
      canceledAt: null,
      canceledById: null,
      cancelReason: null,
    });
    expect(await invitationRow(kidsHalf)).toMatchObject({ status: 'pending' });

    setTestClock({
      instant: at(MINUTE_MS),
    });
    expect((await revoke(fx.kidsId, kidsHalf)).statusCode).toBe(204);
    const later = at(MINUTE_MS);
    expect(await churchRow('ci-two')).toMatchObject(revokedBy('admin', later));
    expect(await invitationRow(worshipHalf)).toMatchObject(revokedBy('admin'));
  });

  it('counts an expired pending sibling as still using the Church Invitation', async () => {
    await churchOffer({ id: 'ci-exp', email: 'exp@revoke.test' });
    const target = await ministryOffer({ churchInvitationId: 'ci-exp' });
    await ministryOffer({
      churchInvitationId: 'ci-exp',
      ministryId: fx.kidsId,
      expiresAt: PAST,
    });
    signIn('admin');

    expect((await revoke(fx.worshipId, target)).statusCode).toBe(204);
    expect((await churchRow('ci-exp')).status).toBe('pending');
  });

  it.each([
    'accepted',
    'rejected',
    'canceled',
  ] as const)('ignores a %s sibling, revoking the parent and leaving that history unchanged', async (status) => {
    await churchOffer({ id: 'ci-mixed', email: 'mixed@revoke.test' });
    const target = await ministryOffer({ churchInvitationId: 'ci-mixed' });
    const closed = await ministryOffer({
      churchInvitationId: 'ci-mixed',
      ministryId: fx.kidsId,
      status,
    });
    const closedBefore = await invitationRow(closed);
    signIn('admin');

    expect((await revoke(fx.worshipId, target)).statusCode).toBe(204);
    expect(await churchRow('ci-mixed')).toMatchObject(revokedBy('admin'));
    expect(await invitationRow(closed)).toEqual(closedBefore);
  });

  it('applies the last-half rule to an admin-upgraded Church Invitation too', async () => {
    await churchOffer({
      id: 'ci-admin',
      email: 'upgraded@revoke.test',
      role: 'admin',
    });
    const id = await ministryOffer({ churchInvitationId: 'ci-admin' });
    signIn('admin');

    expect((await revoke(fx.worshipId, id)).statusCode).toBe(204);
    expect(await churchRow('ci-admin')).toMatchObject({
      ...revokedBy('admin'),
      role: 'admin',
    });
  });

  it('rolls back the half when revoking its Church Invitation fails', async () => {
    const failing = await buildApp({
      wrapRepo: (repo) =>
        Object.assign(Object.create(repo), {
          cancelChurchInvitation: async () => {
            throw new Error('Injected persistence failure');
          },
        }),
    });
    await churchOffer({ id: 'ci-fail', email: 'fail@revoke.test' });
    const id = await ministryOffer({ churchInvitationId: 'ci-fail' });
    signIn('admin');
    const before = await snapshot();

    const res = await failing.app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${fx.worshipId}/invitations/${id}/revoke`,
    });
    await failing.app.close();

    expect(res.statusCode).toBe(500);
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST .../revoke — concurrency', () => {
  it('admits one of two simultaneous revokes of the same invitation', async () => {
    const id = await ministryOffer();
    signIn('admin');

    const results = await Promise.all([
      revoke(fx.worshipId, id),
      revoke(fx.worshipId, id),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([204, 409]);
    expect(await invitationRow(id)).toMatchObject(revokedBy('admin'));
  });

  it('revokes the Church Invitation when the other last half is revoked concurrently', async () => {
    await churchOffer({ id: 'ci-race', email: 'race@revoke.test' });
    const first = await ministryOffer({ churchInvitationId: 'ci-race' });
    const second = await ministryOffer({
      churchInvitationId: 'ci-race',
      ministryId: fx.kidsId,
    });
    const held = await heldRevocation(first, 'ci-race');
    signIn('admin');

    const revoking = revoke(fx.kidsId, second);
    await untilLockWait();
    held.release();
    await held.done;
    const res = await revoking;

    expect(res.statusCode).toBe(204);
    expect(await invitationRow(first)).toMatchObject({ status: 'canceled' });
    expect(await invitationRow(second)).toMatchObject({ status: 'canceled' });
    expect(await churchRow('ci-race')).toMatchObject(revokedBy('admin'));
  });

  it('never overwrites an acceptance that commits while the revoke waits, keeping the grant', async () => {
    const id = await ministryOffer({ inviteeUserId: fx.userIds.invitee });
    const redemption = new DrizzleRedemptionRepository({
      db,
      volunteerRepository: harness.volunteerRepository,
    });
    const accepted = gate();
    const release = gate();
    const accepting = harness.unitOfWork.run(async (tx) => {
      await redemption.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(CHURCH_A),
        ministryInvitationId: id as never,
        userId: UserId.from(fx.userIds.invitee),
        acceptedAt: toDate({ instant: NOW }),
        correlationId: randomUUID(),
        auditAction: 'ministry_acceptance',
        tx,
      });
      accepted.open();
      await release.opened;
    });
    await accepted.opened;
    signIn('admin');

    const revoking = revoke(fx.worshipId, id);
    await untilLockWait();
    release.open();
    await accepting;
    const res = await revoking;

    expect(res.statusCode).toBe(409);
    expect(await invitationRow(id)).toMatchObject({
      status: 'accepted',
      canceledAt: null,
      canceledById: null,
    });
    const grants = await db
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.ministryId, fx.worshipId));
    expect(grants.length).toBeGreaterThan(0);
  });

  it('refuses a resend that waits on a revoke, with no delivery or new expiry', async () => {
    const id = await ministryOffer();
    const held = await heldRevocation(id);
    signIn('admin');

    const resending = post('resend', fx.worshipId, id);
    await untilLockWait();
    held.release();
    await held.done;
    const res = await resending;

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await invitationRow(id)).toMatchObject({
      ...revokedBy('admin'),
      expiresAt: FUTURE,
      resendCount: 0,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it('mints a sibling waiting on a last-half revoke under a fresh Church Invitation, never reviving the revoked one', async () => {
    const email = 'sibling@revoke.test';
    await churchOffer({ id: 'ci-mint', email });
    const id = await ministryOffer({ churchInvitationId: 'ci-mint' });
    const held = await heldRevocation(id, 'ci-mint');

    const minting = harness.manager.mint({
      churchId: ChurchId.from(CHURCH_A),
      ministryId: MinistryId.from(fx.kidsId),
      inviterId: UserId.from(fx.userIds.admin),
      email,
      ministryAccessLevel: 'volunteer',
      roleIds: [fx.helperId as never],
    });
    await untilLockWait();
    held.release();
    await held.done;
    const minted = await minting;

    expect(await churchRow('ci-mint')).toMatchObject(revokedBy('admin'));
    expect(minted.churchInvitationId).toBeDefined();
    expect(minted.churchInvitationId).not.toBe('ci-mint');
    expect((await churchRow(minted.churchInvitationId as string)).status).toBe(
      'pending',
    );
  });
});

describe('revokeChurchOffer — transaction-bound Church revoke', () => {
  it('cancels the Church Invitation and its pending halves with one set of facts, leaving closed halves, and refuses a repeat', async () => {
    await churchOffer({ id: 'ci-direct', email: 'direct@revoke.test' });
    const pendingHalf = await ministryOffer({
      churchInvitationId: 'ci-direct',
    });
    const expiredHalf = await ministryOffer({
      churchInvitationId: 'ci-direct',
      ministryId: fx.kidsId,
      expiresAt: PAST,
    });
    const acceptedHalf = await ministryOffer({
      churchInvitationId: 'ci-direct',
      status: 'accepted',
    });
    const acceptedBefore = await invitationRow(acceptedHalf);
    const run = () =>
      harness.unitOfWork.run((tx) =>
        revokeChurchOffer({
          repo: harness.ministryInvitationRepository,
          churchId: ChurchId.from(CHURCH_A),
          churchInvitationId: 'ci-direct',
          revocation: {
            actorId: UserId.from(fx.userIds.admin),
            at: toDate({ instant: NOW }),
            reason: 'manual',
          },
          tx,
        }),
      );

    expect(await run()).toBe(true);
    expect(await churchRow('ci-direct')).toMatchObject(revokedBy('admin'));
    expect(await invitationRow(pendingHalf)).toMatchObject(revokedBy('admin'));
    expect(await invitationRow(expiredHalf)).toMatchObject(revokedBy('admin'));
    expect(await invitationRow(acceptedHalf)).toEqual(acceptedBefore);

    const before = await snapshot();
    expect(await run()).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
});
