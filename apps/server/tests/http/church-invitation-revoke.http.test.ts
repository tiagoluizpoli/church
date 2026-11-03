import { randomUUID } from 'node:crypto';
import {
  invitation as churchInvitation,
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
import { InvitationController } from '@/api/controllers/invitation-controller';
import {
  revokeChurchOffer,
  revokeMinistryHalf,
} from '@/application/invitation-revocation';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import { getClient } from '@/infrastructure/repositories/helpers';
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
const CHURCH_A = 'a5555555-5555-4555-8555-555555555555';
const CHURCH_B = 'a6666666-6666-4666-8666-666666666666';
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
    slug: 'crev-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'crev-b',
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
    const id = `crev-${key}`;
    await buildUser({ db, id, name: key, email: `${key}@crev.test` });
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
  email?: string;
}

async function churchOffer(input: ChurchOfferInput = {}) {
  const id = randomUUID();
  await db.insert(churchInvitation).values({
    id,
    organizationId: CHURCH_A,
    email: input.email ?? `${id}@invitee.test`,
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
  level?: 'leader' | 'volunteer';
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
}) {
  const id = randomUUID();
  await db.insert(ministryInvitation).values({
    id,
    churchId: CHURCH_A,
    ministryId: input.ministryId ?? worshipId,
    churchInvitationId: input.churchInvitationId,
    ministryAccessLevel: input.level ?? 'volunteer',
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

function post(action: 'revoke' | 'resend', id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/invitations/church/${id}/${action}`,
  });
}

function revoke(id: string) {
  return post('revoke', id);
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

/** Everything a refusal or rollback must leave untouched. */
async function snapshot() {
  return {
    churchRows: await db
      .select()
      .from(churchInvitation)
      .orderBy(churchInvitation.id),
    ministryRows: await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id),
    roleRows: await db
      .select()
      .from(ministryInvitationRole)
      .orderBy(ministryInvitationRole.id),
    memberships: await db
      .select()
      .from(ministryMembership)
      .orderBy(ministryMembership.id),
    outboxRows: await outboxRows(),
  };
}

/** The revocation facts a manual revoke at `when` by `actor` records. */
function revokedBy(actor: Persona, when: Instant = NOW) {
  return {
    status: 'canceled',
    canceledById: userIds[actor],
    canceledAt: toDate({ instant: when }),
    cancelReason: 'manual',
  };
}

const untouched = { canceledAt: null, canceledById: null, cancelReason: null };

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

/** Runs `work` in a transaction and holds it open, locks included, until released. */
async function held(
  work: (
    tx: Parameters<Parameters<typeof harness.unitOfWork.run>[0]>[0],
  ) => Promise<unknown>,
) {
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const done = harness.unitOfWork.run(async (tx) => {
    await work(tx);
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  return { release: () => release.resolve(), done };
}

const revocation = (actor: Persona) => ({
  actorId: UserId.from(userIds[actor]),
  at: toDate({ instant: NOW }),
  reason: 'manual' as const,
});

describe('POST /invitations/church/:invitationId/revoke — authority', () => {
  it('lets a ChurchAdmin without a Volunteer profile revoke a standalone admin offer, keeping the row and sending nothing', async () => {
    const id = await churchOffer({ expiresAt: PAST });
    signIn('admin');

    const res = await revoke(id);

    expect(res.statusCode).toBe(204);
    expect(await churchRow(id)).toMatchObject({
      ...revokedBy('admin'),
      role: 'admin',
      inviterId: userIds.admin,
      expiresAt: PAST,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it('answers a non-admin with 403 and a missing or foreign target with one 404, with no writes', async () => {
    const id = await churchOffer();
    await half({ churchInvitationId: id });
    const before = await snapshot();

    signIn('worshipLeader');
    expect((await revoke(id)).statusCode).toBe(403);
    signIn('member');
    expect((await revoke(id)).statusCode).toBe(403);
    signIn('foreignAdmin');
    const foreign = await revoke(id);
    signIn('admin');
    const missing = await revoke(randomUUID());

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
    expect(await snapshot()).toEqual(before);
  });

  it('checks scope before lifecycle: a closed offer is 403 to a non-admin and 404 to another Church', async () => {
    const id = await churchOffer({ status: 'canceled' });
    signIn('worshipLeader');
    expect((await revoke(id)).statusCode).toBe(403);
    signIn('foreignAdmin');
    expect((await revoke(id)).statusCode).toBe(404);
  });
});

describe('POST /invitations/church/:invitationId/revoke — shared offer', () => {
  it('cancels an admin-upgraded offer and every pending half, expired included, with one set of facts; completed halves, Roles and Memberships stay', async () => {
    const id = await churchOffer({ role: 'admin' });
    const worshipHalf = await half({ churchInvitationId: id, level: 'leader' });
    const expiredHalf = await half({
      churchInvitationId: id,
      ministryId: kidsId,
      expiresAt: PAST,
    });
    const completed = {
      accepted: await half({ churchInvitationId: id, status: 'accepted' }),
      rejected: await half({
        churchInvitationId: id,
        ministryId: kidsId,
        status: 'rejected',
      }),
      canceled: await half({ churchInvitationId: id, status: 'canceled' }),
    };
    const unrelatedChurch = await churchOffer();
    const unrelatedHalf = await half({ churchInvitationId: unrelatedChurch });
    const before = await snapshot();
    signIn('admin');

    const res = await revoke(id);

    expect(res.statusCode).toBe(204);
    expect(await churchRow(id)).toMatchObject({
      ...revokedBy('admin'),
      role: 'admin',
    });
    expect(await ministryRow(worshipHalf)).toMatchObject({
      ...revokedBy('admin'),
      ministryAccessLevel: 'leader',
    });
    expect(await ministryRow(expiredHalf)).toMatchObject({
      ...revokedBy('admin'),
      expiresAt: PAST,
    });
    for (const completedId of Object.values(completed)) {
      expect(await ministryRow(completedId)).toEqual(
        before.ministryRows.find((row) => row.id === completedId),
      );
    }
    expect(await churchRow(unrelatedChurch)).toMatchObject({
      status: 'pending',
      ...untouched,
    });
    expect(await ministryRow(unrelatedHalf)).toMatchObject({
      status: 'pending',
      ...untouched,
    });
    const after = await snapshot();
    expect(after.roleRows).toEqual(before.roleRows);
    expect(after.memberships).toEqual(before.memberships);
    expect(after.outboxRows).toEqual([]);
  });

  it('refuses a repeated revoke with 409 and keeps the first closure facts', async () => {
    const id = await churchOffer();
    const pendingHalf = await half({ churchInvitationId: id });
    signIn('admin');
    expect((await revoke(id)).statusCode).toBe(204);
    setTestClock({
      instant: addMilliseconds({ instant: NOW, milliseconds: 60_000 }),
    });
    const before = await snapshot();

    const res = await revoke(id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await snapshot()).toEqual(before);
    expect(await churchRow(id)).toMatchObject(revokedBy('admin'));
    expect(await ministryRow(pendingHalf)).toMatchObject(revokedBy('admin'));
  });

  it.each([
    'accepted',
    'rejected',
  ] as const)('refuses a %s offer with 409 and leaves its halves alone', async (status) => {
    const id = await churchOffer({ status, expiresAt: PAST });
    await half({ churchInvitationId: id });
    const before = await snapshot();
    signIn('admin');

    const res = await revoke(id);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INVITATION_NOT_PENDING');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls the whole offer back when cancelling a half fails', async () => {
    const id = await churchOffer();
    await half({ churchInvitationId: id });
    await half({ churchInvitationId: id, ministryId: kidsId });
    const before = await snapshot();
    const real =
      harness.ministryInvitationRepository.cancelMinistryInvitation.bind(
        harness.ministryInvitationRepository,
      );
    vi.spyOn(harness.ministryInvitationRepository, 'cancelMinistryInvitation')
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error('write failed'));
    signIn('admin');

    expect((await revoke(id)).statusCode).toBe(500);

    expect(await snapshot()).toEqual(before);
  });
});

describe('POST /invitations/church/:invitationId/revoke — concurrency', () => {
  it('admits one of two simultaneous revokes', async () => {
    const id = await churchOffer();
    const pendingHalf = await half({ churchInvitationId: id });
    signIn('admin');

    const results = await Promise.all([revoke(id), revoke(id)]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([204, 409]);
    expect(await churchRow(id)).toMatchObject(revokedBy('admin'));
    expect(await ministryRow(pendingHalf)).toMatchObject(revokedBy('admin'));
  });

  it('never overwrites an acceptance that commits while the revoke waits', async () => {
    const id = await churchOffer();
    const pendingHalf = await half({ churchInvitationId: id });
    // Acceptance's lock order: the Church Invitation row, then its halves.
    const accepting = await held(async (tx) => {
      await harness.ministryInvitationRepository.lockChurchInvitation({
        churchId: ChurchId.from(CHURCH_A),
        churchInvitationId: id,
        tx,
      });
      const client = getClient({ db, tx });
      await client
        .update(churchInvitation)
        .set({ status: 'accepted' })
        .where(eq(churchInvitation.id, id));
      await client
        .update(ministryInvitation)
        .set({ status: 'accepted' })
        .where(eq(ministryInvitation.id, pendingHalf));
    });
    signIn('admin');

    const revoking = revoke(id);
    await untilLockWait();
    accepting.release();
    await accepting.done;
    const res = await revoking;

    expect(res.statusCode).toBe(409);
    expect(await churchRow(id)).toMatchObject({
      status: 'accepted',
      ...untouched,
    });
    expect(await ministryRow(pendingHalf)).toMatchObject({
      status: 'accepted',
      ...untouched,
    });
  });

  it('refuses a resend that waits on a Church revoke, with no delivery or new expiry', async () => {
    const id = await churchOffer();
    const pendingHalf = await half({ churchInvitationId: id });
    const revoking = await held((tx) =>
      revokeChurchOffer({
        repo: harness.ministryInvitationRepository,
        churchId: ChurchId.from(CHURCH_A),
        churchInvitationId: id,
        revocation: revocation('admin'),
        tx,
      }),
    );
    signIn('admin');

    const resending = post('resend', id);
    await untilLockWait();
    revoking.release();
    await revoking.done;
    const res = await resending;

    expect(res.statusCode).toBe(409);
    expect(await churchRow(id)).toMatchObject({
      ...revokedBy('admin'),
      expiresAt: FUTURE,
      resendCount: 0,
    });
    expect(await ministryRow(pendingHalf)).toMatchObject({
      ...revokedBy('admin'),
      expiresAt: FUTURE,
    });
    expect(await outboxRows()).toEqual([]);
  });

  it("cancels the remaining halves when a sibling Ministry revoke commits first, keeping that sibling's own facts", async () => {
    const id = await churchOffer();
    const first = await half({ churchInvitationId: id });
    const second = await half({ churchInvitationId: id, ministryId: kidsId });
    const sibling = await held((tx) =>
      revokeMinistryHalf({
        repo: harness.ministryInvitationRepository,
        churchId: ChurchId.from(CHURCH_A),
        ministryInvitationId: first,
        churchInvitationId: id,
        revocation: revocation('worshipLeader'),
        tx,
      }),
    );
    signIn('admin');

    const revoking = revoke(id);
    await untilLockWait();
    sibling.release();
    await sibling.done;
    const res = await revoking;

    expect(res.statusCode).toBe(204);
    expect(await ministryRow(first)).toMatchObject(revokedBy('worshipLeader'));
    expect(await ministryRow(second)).toMatchObject(revokedBy('admin'));
    expect(await churchRow(id)).toMatchObject(revokedBy('admin'));
  });

  it("answers 409 when the last half's Ministry revoke already closed the offer", async () => {
    const id = await churchOffer();
    const only = await half({ churchInvitationId: id });
    const sibling = await held((tx) =>
      revokeMinistryHalf({
        repo: harness.ministryInvitationRepository,
        churchId: ChurchId.from(CHURCH_A),
        ministryInvitationId: only,
        churchInvitationId: id,
        revocation: revocation('worshipLeader'),
        tx,
      }),
    );
    signIn('admin');

    const revoking = revoke(id);
    await untilLockWait();
    sibling.release();
    await sibling.done;
    const res = await revoking;

    expect(res.statusCode).toBe(409);
    expect(await churchRow(id)).toMatchObject(revokedBy('worshipLeader'));
    expect(await ministryRow(only)).toMatchObject(revokedBy('worshipLeader'));
  });

  it('mints a sibling waiting on a Church revoke under a fresh Church Invitation, never reviving the revoked offer', async () => {
    const email = 'sibling@crev.test';
    const id = await churchOffer({ email, role: 'member' });
    const pendingHalf = await half({ churchInvitationId: id });
    const revoking = await held((tx) =>
      revokeChurchOffer({
        repo: harness.ministryInvitationRepository,
        churchId: ChurchId.from(CHURCH_A),
        churchInvitationId: id,
        revocation: revocation('admin'),
        tx,
      }),
    );

    const minting = harness.manager.mint({
      churchId: ChurchId.from(CHURCH_A),
      ministryId: MinistryId.from(kidsId),
      inviterId: UserId.from(userIds.admin),
      email,
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    await untilLockWait();
    revoking.release();
    await revoking.done;
    const minted = await minting;

    expect(await churchRow(id)).toMatchObject(revokedBy('admin'));
    expect(await ministryRow(pendingHalf)).toMatchObject(revokedBy('admin'));
    expect(minted.churchInvitationId).toBeDefined();
    expect(minted.churchInvitationId).not.toBe(id);
    expect((await churchRow(minted.churchInvitationId as string)).status).toBe(
      'pending',
    );
  });
});
