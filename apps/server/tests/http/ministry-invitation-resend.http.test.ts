import { randomUUID } from 'node:crypto';
import { type AppConfig, appConfig } from '@church/app-config';
import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
} from '@church/db';
import {
  addMilliseconds,
  type Instant,
  now,
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
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
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
const DAY_MS = 24 * 60 * MINUTE_MS;
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
  config?: AppConfig;
  notifications?: IChurchNotifications;
}

/** Real managers, repositories and AuthorityService; only session and Active Church are seams. */
async function buildApp({ config = appConfig, notifications }: BuildAppInput) {
  const harness = createMinistryInvitationTestHarness({ db, config });
  const manager = notifications
    ? new DbMinistryInvitationManager({
        repo: harness.ministryInvitationRepository,
        roleRepository: harness.roleRepository,
        ministryRepository: harness.ministryRepository,
        authorityManager: harness.authorityManager,
        unitOfWork: harness.unitOfWork,
        outboxRepository: harness.outboxRepository,
        notifications,
        config,
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
  ({ app, harness } = await buildApp({}));
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
  const userId = `resend-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@resend.test` });
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
    slug: 'resend-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'resend-b',
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

function resendOn(
  target: FastifyTypedInstance,
  ministryId: string,
  id: string,
) {
  return target.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/invitations/${id}/resend`,
  });
}

function resend(ministryId: string, id: string) {
  return resendOn(app, ministryId, id);
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

function expiryAfter(milliseconds: number, from: Instant = now()): Date {
  return toDate({ instant: addMilliseconds({ instant: from, milliseconds }) });
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

describe('POST /ministries/:ministryId/invitations/:invitationId/resend — authority', () => {
  it('lets a ChurchAdmin without a Volunteer profile resend a member-targeted invitation by N1', async () => {
    const id = await ministryOffer({ roleIds: [fx.singerId] });
    signIn('admin');

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id,
      status: 'pending',
      deliveryStatus: 'pending',
    });
    const row = await invitationRow(id);
    expect(row.expiresAt).toEqual(
      expiryAfter(appConfig.ministryInvitation.ttlMs),
    );
    expect(row).toMatchObject({
      inviterId: fx.userIds.worshipLeader,
      createdAt: CREATED_AT,
      resendCount: 1,
    });
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        kind: 'notification',
        payload: expect.objectContaining({
          kind: 'ministry_invitation',
          data: { ministryInvitationId: id },
        }),
      }),
    ]);
  });

  it.each([
    ['their own volunteer-level invitation', 'worshipLeader', 'volunteer'],
    [
      'a leader-level invitation as an admin who also leads',
      'adminLeader',
      'leader',
    ],
  ] as const)('lets a leader resend %s', async (_label, key, level) => {
    const id = await ministryOffer({ level });
    signIn(key);
    expect((await resend(fx.worshipId, id)).statusCode).toBe(200);
  });

  it('refuses a leader resending a leader-level invitation in their own Ministry, with no writes, even once closed', async () => {
    const open = await ministryOffer({ level: 'leader' });
    const closed = await ministryOffer({
      level: 'leader',
      inviteeUserId: fx.userIds.memberNoVolunteer,
      status: 'accepted',
    });
    signIn('worshipLeader');
    const before = await snapshot();

    for (const id of [open, closed]) {
      const res = await resend(fx.worshipId, id);
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
    const unmanaged = await resend(fx.worshipId, worshipOffer);
    signIn('admin');
    const mismatched = await resend(fx.worshipId, kidsOffer);
    const foreign = await resend(fx.foreignMinistryId, foreignOffer);
    const foreignUnderOwn = await resend(fx.worshipId, foreignOffer);
    const missing = await resend(fx.worshipId, randomUUID());
    const malformed = await resend(fx.worshipId, 'not-a-uuid');

    const responses = [
      unmanaged,
      mismatched,
      foreign,
      foreignUnderOwn,
      missing,
      malformed,
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
    const res = await resend(fx.worshipId, id);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });
});

describe('POST .../resend — lifecycle', () => {
  it('reissues an expired pending invitation for a fresh lifetime', async () => {
    const id = await ministryOffer({ expiresAt: PAST });
    signIn('admin');

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(200);
    expect((await invitationRow(id)).expiresAt).toEqual(
      expiryAfter(appConfig.ministryInvitation.ttlMs),
    );
  });

  it.each([
    'accepted',
    'rejected',
    'canceled',
  ] as const)('refuses a visible %s invitation with 409 and no writes', async (status) => {
    const id = await ministryOffer({ status });
    signIn('admin');
    const before = await snapshot();

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    'accepted',
    'rejected',
    'canceled',
  ] as const)('refuses a pending half whose Church parent is %s, without extending the child', async (status) => {
    await churchOffer({ id: 'ci-closed', email: 'closed@resend.test', status });
    const id = await ministryOffer({ churchInvitationId: 'ci-closed' });
    signIn('admin');
    const before = await snapshot();

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await snapshot()).toEqual(before);
  });

  it('refuses an invitation in an archived Ministry as not found', async () => {
    const id = await ministryOffer();
    await db
      .update(ministry)
      .set({ deletedAt: toDate({ instant: NOW }) })
      .where(eq(ministry.id, fx.worshipId));
    signIn('admin');
    const before = await snapshot();

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('MINISTRY_NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST .../resend — shared Church offer', () => {
  it('restarts the parent and every still-pending sibling on the Church lifetime, sends one admin-offer T1, and spends only its counters', async () => {
    await churchOffer({
      id: 'ci-shared',
      email: 'shared@resend.test',
      role: 'admin',
      expiresAt: PAST,
    });
    const target = await ministryOffer({
      churchInvitationId: 'ci-shared',
      roleIds: [fx.singerId],
      expiresAt: PAST,
    });
    const sibling = await ministryOffer({
      ministryId: fx.kidsId,
      churchInvitationId: 'ci-shared',
      level: 'leader',
      expiresAt: PAST,
      resendCount: 3,
    });
    const declined = await ministryOffer({
      ministryId: fx.kidsId,
      churchInvitationId: 'ci-shared',
      status: 'rejected',
      expiresAt: PAST,
    });
    const siblingBefore = await invitationRow(sibling);
    signIn('admin');

    const res = await resend(fx.worshipId, target);

    expect(res.statusCode).toBe(200);
    const expected = expiryAfter(appConfig.churchInvitation.ttlMs);
    expect(res.json().expiresAt).toBe(expected.toISOString());
    const parent = await churchRow('ci-shared');
    expect(parent).toMatchObject({
      role: 'admin',
      status: 'pending',
      expiresAt: expected,
    });
    expect(await invitationRow(target)).toMatchObject({
      expiresAt: expected,
      resendCount: 1,
      churchInvitationId: 'ci-shared',
      createdAt: CREATED_AT,
    });
    expect(await invitationRow(sibling)).toEqual({
      ...siblingBefore,
      expiresAt: expected,
      updatedAt: expect.any(Date),
    });
    expect((await invitationRow(declined)).expiresAt).toEqual(PAST);
    const roles = await db
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(eq(ministryInvitationRole.ministryInvitationId, target));
    expect(roles).toEqual([{ roleId: fx.singerId }]);
    // The upgraded offer's one T1 names the admin grant and every pending half.
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        kind: 'invitation.church-bootstrap',
        payload: { churchInvitationId: 'ci-shared' },
      }),
    ]);

    // The aligned sibling keeps its own, unspent resend allowance.
    expect((await resend(fx.kidsId, sibling)).statusCode).toBe(200);
  });

  it('emails a member-level paired half its own T1, as its mint did', async () => {
    await churchOffer({ id: 'ci-member', email: 'member@resend.test' });
    const target = await ministryOffer({ churchInvitationId: 'ci-member' });
    signIn('admin');

    expect((await resend(fx.worshipId, target)).statusCode).toBe(200);

    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        kind: 'invitation.chained',
        payload: { ministryInvitationId: target },
      }),
    ]);
  });

  it('uses the injected lifetimes: Ministry for a standalone offer, Church for a paired one', async () => {
    const config: AppConfig = {
      ...appConfig,
      ministryInvitation: { ttlMs: 3 * DAY_MS },
      churchInvitation: { ttlMs: 2 * DAY_MS },
    };
    const custom = await buildApp({ config });
    try {
      await churchOffer({ id: 'ci-pair', email: 'pair@resend.test' });
      const paired = await ministryOffer({ churchInvitationId: 'ci-pair' });
      const standalone = await ministryOffer();
      signIn('admin');

      expect(
        (await resendOn(custom.app, fx.worshipId, standalone)).statusCode,
      ).toBe(200);
      expect(
        (await resendOn(custom.app, fx.worshipId, paired)).statusCode,
      ).toBe(200);

      expect((await invitationRow(standalone)).expiresAt).toEqual(
        expiryAfter(3 * DAY_MS),
      );
      expect((await invitationRow(paired)).expiresAt).toEqual(
        expiryAfter(2 * DAY_MS),
      );
      expect((await churchRow('ci-pair')).expiresAt).toEqual(
        expiryAfter(2 * DAY_MS),
      );
    } finally {
      await custom.app.close();
    }
  });
});

describe('POST .../resend — delivery', () => {
  it('recovers a failed email with one fresh queued delivery', async () => {
    await churchOffer({ id: 'ci-failed', email: 'failed@resend.test' });
    const id = await ministryOffer({ churchInvitationId: 'ci-failed' });
    await db.insert(outboxMessage).values({
      churchId: CHURCH_A,
      kind: 'invitation.chained',
      payload: { ministryInvitationId: id, churchInvitationId: 'ci-failed' },
      status: 'failed',
      scheduledFor: CREATED_AT,
      correlationId: randomUUID(),
      createdAt: CREATED_AT,
    });
    signIn('admin');

    const res = await resend(fx.worshipId, id);

    expect(res.statusCode).toBe(200);
    expect(res.json().deliveryStatus).toBe('pending');
    expect((await outboxRows()).map((row) => row.status)).toEqual([
      'failed',
      'pending',
    ]);
  });

  it('rolls back expiry and counters when the delivery intention cannot be written', async () => {
    const failing = await buildApp({
      notifications: {
        enqueue: () => Promise.reject(new Error('outbox unavailable')),
      },
    });
    try {
      const id = await ministryOffer({ expiresAt: PAST });
      signIn('admin');
      const before = await snapshot();

      const res = await resendOn(failing.app, fx.worshipId, id);

      expect(res.statusCode).toBe(500);
      expect(await snapshot()).toEqual(before);
    } finally {
      await failing.app.close();
    }
  });
});

describe('POST .../resend — policy', () => {
  it('allows the first resend right after mint and enforces the cooldown at its exact boundary', async () => {
    const id = await ministryOffer();
    signIn('admin');

    expect((await resend(fx.worshipId, id)).statusCode).toBe(200);
    setTestClock({ instant: at(MINUTE_MS - 1) });
    const early = await resend(fx.worshipId, id);
    expect(early.statusCode).toBe(429);
    expect(early.json().error).toBe('RESEND_COOLDOWN_ACTIVE');
    setTestClock({ instant: at(MINUTE_MS) });
    expect((await resend(fx.worshipId, id)).statusCode).toBe(200);
    expect((await invitationRow(id)).resendCount).toBe(2);
    expect(await outboxRows()).toHaveLength(2);
  });

  it('allows ten resends per window anchored at the first and reopens exactly 24 hours later', async () => {
    const id = await ministryOffer();
    signIn('admin');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      setTestClock({ instant: at(attempt * MINUTE_MS) });
      expect((await resend(fx.worshipId, id)).statusCode).toBe(200);
    }
    setTestClock({ instant: at(10 * MINUTE_MS) });
    const eleventh = await resend(fx.worshipId, id);
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error).toBe('RESEND_DAILY_CAP_EXCEEDED');
    setTestClock({ instant: at(DAY_MS - 1) });
    expect((await resend(fx.worshipId, id)).statusCode).toBe(429);
    setTestClock({ instant: at(DAY_MS) });
    expect((await resend(fx.worshipId, id)).statusCode).toBe(200);

    const row = await invitationRow(id);
    expect(row.resendCount).toBe(1);
    expect(row.resendWindowStartedAt).toEqual(toDate({ instant: at(DAY_MS) }));
    expect(await outboxRows()).toHaveLength(11);
  });

  it('keeps another invitation independently resendable', async () => {
    const first = await ministryOffer();
    const second = await ministryOffer({
      inviteeUserId: fx.userIds.memberNoVolunteer,
    });
    signIn('admin');

    expect((await resend(fx.worshipId, first)).statusCode).toBe(200);
    expect((await resend(fx.worshipId, first)).statusCode).toBe(429);
    expect((await resend(fx.worshipId, second)).statusCode).toBe(200);
  });

  it('follows an injected policy rather than hard-coded limits', async () => {
    const custom = await buildApp({
      config: {
        ...appConfig,
        invitationResend: {
          cooldownMs: 5_000,
          dailyCap: 2,
          windowMs: 60 * MINUTE_MS,
        },
      },
    });
    try {
      const id = await ministryOffer();
      signIn('admin');
      const send = () => resendOn(custom.app, fx.worshipId, id);

      expect((await send()).statusCode).toBe(200);
      setTestClock({ instant: at(5_000) });
      expect((await send()).statusCode).toBe(200);
      setTestClock({ instant: at(10_000) });
      expect((await send()).json().error).toBe('RESEND_DAILY_CAP_EXCEEDED');
      setTestClock({ instant: at(60 * MINUTE_MS) });
      expect((await send()).statusCode).toBe(200);
    } finally {
      await custom.app.close();
    }
  });
});

describe('POST .../resend — concurrency', () => {
  it('admits one of two simultaneous resends of the same invitation', async () => {
    const id = await ministryOffer();
    signIn('admin');

    const results = await Promise.all([
      resend(fx.worshipId, id),
      resend(fx.worshipId, id),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 429]);
    expect((await invitationRow(id)).resendCount).toBe(1);
    expect(await outboxRows()).toHaveLength(1);
  });

  it('never overwrites an acceptance that commits while the resend waits', async () => {
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

    const resending = resend(fx.worshipId, id);
    await untilLockWait();
    release.open();
    await accepting;
    const res = await resending;

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await invitationRow(id)).toMatchObject({
      status: 'accepted',
      expiresAt: FUTURE,
      resendCount: 0,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it('cannot reissue an invitation into a Ministry archived while the resend waits', async () => {
    const id = await ministryOffer();
    const locked = gate();
    const release = gate();
    const archiving = harness.unitOfWork.run(async (tx) => {
      await harness.ministryRepository.lockActive({
        churchId: ChurchId.from(CHURCH_A),
        ministryId: MinistryId.from(fx.worshipId),
        strength: 'update',
        tx,
      });
      await harness.ministryRepository.archive({
        churchId: ChurchId.from(CHURCH_A),
        ministryId: MinistryId.from(fx.worshipId),
        archivedAt: NOW,
        tx,
      });
      locked.open();
      await release.opened;
    });
    await locked.opened;
    signIn('admin');

    const resending = resend(fx.worshipId, id);
    await untilLockWait();
    release.open();
    await archiving;
    const res = await resending;

    expect(res.statusCode).toBe(404);
    expect(await invitationRow(id)).toMatchObject({
      expiresAt: FUTURE,
      resendCount: 0,
    });
    expect(await outboxRows()).toEqual([]);
  });
});
