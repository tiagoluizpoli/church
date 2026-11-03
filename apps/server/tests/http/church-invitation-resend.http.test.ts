import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import {
  invitation as churchInvitation,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
} from '@church/db';
import {
  addMilliseconds,
  now,
  parseInstant,
  resetClock,
  setTestClock,
  toDate,
} from '@church/time';
import { eq } from 'drizzle-orm';
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
import { InvitationController } from '@/api/controllers/invitation-controller';
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
const CHURCH_A = 'a3333333-3333-4333-8333-333333333333';
const CHURCH_B = 'a4444444-4444-4444-8444-444444444444';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const FUTURE = new Date('2026-11-05T12:00:00.000Z');
const PAST = new Date('2026-10-30T12:00:00.000Z');

type Persona = 'admin' | 'worshipLeader' | 'member' | 'foreignAdmin';

const harness = createMinistryInvitationTestHarness({ db });
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const controller = new InvitationController({
    invitationListManager: {} as never,
    ministryInvitationManager: harness.manager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: harness.authorityManager }),
    maxPageSize: 50,
  });
  await app.register(
    async (scoped) => {
      scoped.register(controller.registerRoutes.bind(controller), {
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

let userIds: Record<Persona, string>;
let worshipId: string;
let kidsId: string;
let singerId: string;

beforeEach(async () => {
  vi.resetAllMocks();
  setTestClock({ instant: NOW });
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'cres-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'cres-b',
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  worshipId = worship.id;
  kidsId = (await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' })).id;
  singerId = (
    await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: worship.id,
      name: 'Singer',
    })
  ).id;
  const make = async (
    key: Persona,
    churchId: string,
    access: 'admin' | 'member',
  ) => {
    const id = `cres-${key}`;
    await buildUser({ db, id, name: key, email: `${key}@cres.test` });
    await buildChurchMembership({
      db,
      churchId,
      userId: id,
      accessLevel: access,
    });
    return id;
  };
  userIds = {
    admin: await make('admin', CHURCH_A, 'admin'),
    worshipLeader: await make('worshipLeader', CHURCH_A, 'member'),
    member: await make('member', CHURCH_A, 'member'),
    foreignAdmin: await make('foreignAdmin', CHURCH_B, 'admin'),
  };
  const volunteer = await buildVolunteer({
    db,
    churchId: CHURCH_A,
    userId: userIds.worshipLeader,
  });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: volunteer.id,
    ministryId: worship.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
});

afterEach(() => resetClock());

function signIn(key: Persona) {
  mockGetSession.mockResolvedValue({
    user: { id: userIds[key] },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: key === 'foreignAdmin' ? CHURCH_B : CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
}

interface ChurchOfferInput {
  role?: 'admin' | 'member';
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
  resendCount?: number;
  lastResendAt?: Date;
}

async function churchOffer(input: ChurchOfferInput = {}) {
  const id = randomUUID();
  await db.insert(churchInvitation).values({
    id,
    organizationId: CHURCH_A,
    email: `${id}@invitee.test`,
    role: input.role ?? 'admin',
    status: input.status ?? 'pending',
    expiresAt: input.expiresAt ?? FUTURE,
    inviterId: userIds.admin,
    createdAt: CREATED_AT,
    resendCount: input.resendCount ?? 0,
    lastResendAt: input.lastResendAt,
  });
  return id;
}

async function half(input: {
  churchInvitationId: string;
  ministryId?: string;
  status?: 'pending' | 'canceled';
  expiresAt?: Date;
}) {
  const id = randomUUID();
  await db.insert(ministryInvitation).values({
    id,
    churchId: CHURCH_A,
    ministryId: input.ministryId ?? worshipId,
    churchInvitationId: input.churchInvitationId,
    ministryAccessLevel: 'volunteer',
    status: input.status ?? 'pending',
    inviterId: userIds.worshipLeader,
    expiresAt: input.expiresAt ?? FUTURE,
    createdAt: CREATED_AT,
  });
  await db
    .insert(ministryInvitationRole)
    .values({ churchId: CHURCH_A, ministryInvitationId: id, roleId: singerId });
  return id;
}

function resend(id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/invitations/church/${id}/resend`,
  });
}

async function churchRow(id: string) {
  const [row] = await db
    .select()
    .from(churchInvitation)
    .where(eq(churchInvitation.id, id));
  if (!row) throw new Error(`No Church Invitation ${id}`);
  return row;
}

async function ministryRow(id: string) {
  const [row] = await db
    .select()
    .from(ministryInvitation)
    .where(eq(ministryInvitation.id, id));
  if (!row) throw new Error(`No Ministry Invitation ${id}`);
  return row;
}

async function outboxRows() {
  return db
    .select({ kind: outboxMessage.kind, payload: outboxMessage.payload })
    .from(outboxMessage);
}

function expiryAfter(milliseconds: number): Date {
  return toDate({ instant: addMilliseconds({ instant: now(), milliseconds }) });
}

function advance(milliseconds: number) {
  setTestClock({ instant: addMilliseconds({ instant: now(), milliseconds }) });
}

describe('POST /invitations/church/:invitationId/resend', () => {
  it('resends a standalone admin offer: Church lifetime, counters, one T1', async () => {
    const id = await churchOffer({ expiresAt: PAST });
    signIn('admin');

    const res = await resend(id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      kind: 'church',
      id,
      expiresAt: expiryAfter(appConfig.churchInvitation.ttlMs).toISOString(),
      deliveryStatus: 'pending',
    });
    expect(await churchRow(id)).toMatchObject({
      expiresAt: expiryAfter(appConfig.churchInvitation.ttlMs),
      resendCount: 1,
      lastResendAt: toDate({ instant: now() }),
      inviterId: userIds.admin,
      role: 'admin',
    });
    expect(await outboxRows()).toEqual([
      {
        kind: 'invitation.church-bootstrap',
        payload: { churchInvitationId: id },
      },
    ]);
  });

  it('aligns every pending Ministry half, keeps closed siblings and half counters, and sends one email', async () => {
    const id = await churchOffer({ expiresAt: PAST });
    const a = await half({ churchInvitationId: id, expiresAt: PAST });
    const b = await half({ churchInvitationId: id, ministryId: kidsId });
    const closed = await half({
      churchInvitationId: id,
      ministryId: kidsId,
      status: 'canceled',
      expiresAt: PAST,
    });
    signIn('admin');

    const res = await resend(id);

    expect(res.statusCode).toBe(200);
    const expected = expiryAfter(appConfig.churchInvitation.ttlMs);
    expect((await ministryRow(a)).expiresAt).toEqual(expected);
    expect((await ministryRow(b)).expiresAt).toEqual(expected);
    expect(await ministryRow(a)).toMatchObject({
      resendCount: 0,
      status: 'pending',
    });
    expect(await ministryRow(closed)).toMatchObject({
      status: 'canceled',
      expiresAt: PAST,
    });
    expect(await outboxRows()).toHaveLength(1);
  });

  it('enforces the cooldown and cap boundaries on the Church row only', async () => {
    const id = await churchOffer();
    const sibling = await half({ churchInvitationId: id });
    signIn('admin');

    expect((await resend(id)).statusCode).toBe(200);
    advance(appConfig.invitationResend.cooldownMs - 1);
    expect((await resend(id)).statusCode).toBe(429);
    advance(1);
    expect((await resend(id)).statusCode).toBe(200);
    expect(await outboxRows()).toHaveLength(2);
    expect((await ministryRow(sibling)).resendCount).toBe(0);
  });

  it('refuses the eleventh resend inside the window with no writes and reopens after it', async () => {
    const id = await churchOffer();
    signIn('admin');
    for (let n = 0; n < appConfig.invitationResend.dailyCap; n += 1) {
      expect((await resend(id)).statusCode).toBe(200);
      advance(appConfig.invitationResend.cooldownMs);
    }
    const before = await churchRow(id);
    const refused = await resend(id);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error).toBe('RESEND_DAILY_CAP_EXCEEDED');
    expect(await churchRow(id)).toEqual(before);

    advance(appConfig.invitationResend.windowMs);
    expect((await resend(id)).statusCode).toBe(200);
  });

  it('answers a non-admin with 403 and a missing or foreign target with one 404', async () => {
    const id = await churchOffer();
    signIn('worshipLeader');
    expect((await resend(id)).statusCode).toBe(403);
    signIn('member');
    expect((await resend(id)).statusCode).toBe(403);

    signIn('foreignAdmin');
    const foreign = await resend(id);
    signIn('admin');
    const missing = await resend(randomUUID());
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
    expect(await outboxRows()).toEqual([]);
    expect((await churchRow(id)).resendCount).toBe(0);
  });

  it.each([
    'accepted',
    'rejected',
    'canceled',
  ] as const)('refuses a %s offer with 409 and no writes', async (status) => {
    const id = await churchOffer({ status, expiresAt: PAST });
    signIn('admin');
    const res = await resend(id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await churchRow(id)).toMatchObject({
      status,
      expiresAt: PAST,
      resendCount: 0,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it('answers a member-level paired parent like a missing target: it is no Church row, and its T1 would promise admin access', async () => {
    const id = await churchOffer({ role: 'member', expiresAt: PAST });
    await half({ churchInvitationId: id, expiresAt: PAST });
    signIn('admin');
    const missing = await resend(randomUUID());

    const res = await resend(id);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(missing.json());
    expect(await churchRow(id)).toMatchObject({
      expiresAt: PAST,
      resendCount: 0,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it('rolls back expiry and counters when the delivery cannot be queued', async () => {
    const id = await churchOffer({ expiresAt: PAST });
    const pairedHalf = await half({ churchInvitationId: id, expiresAt: PAST });
    signIn('admin');
    vi.spyOn(
      harness.ministryInvitationRepository,
      'enqueueOutboxMessage',
    ).mockRejectedValueOnce(new Error('outbox down'));

    expect((await resend(id)).statusCode).toBe(500);

    expect(await churchRow(id)).toMatchObject({
      expiresAt: PAST,
      resendCount: 0,
    });
    expect((await ministryRow(pairedHalf)).expiresAt).toEqual(PAST);
  });

  it('admits one of two simultaneous resends', async () => {
    const id = await churchOffer();
    signIn('admin');
    const results = await Promise.all([resend(id), resend(id)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 429]);
    expect(await outboxRows()).toHaveLength(1);
    expect((await churchRow(id)).resendCount).toBe(1);
  });
});
