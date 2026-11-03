import { randomUUID } from 'node:crypto';
import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
} from '@church/db';
import { parseInstant, resetClock, setTestClock, toDate } from '@church/time';
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
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import { DrizzleRedemptionRepository } from '@/infrastructure/repositories';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildCycle,
  buildEvent,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
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
const CHURCH_A = 'b1111111-1111-4111-8111-111111111111';
const CHURCH_B = 'b2222222-2222-4222-8222-222222222222';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const CREATED_AT = new Date('2026-11-01T10:00:00.000Z');
const FUTURE = new Date('2026-11-05T12:00:00.000Z');
const PAST = new Date('2026-10-30T12:00:00.000Z');

type Persona = 'admin' | 'otherAdmin' | 'worshipLeader' | 'invitee' | 'foreign';

interface BuildAppInput {
  /** Wraps the real repository, e.g. to inject a persistence failure. */
  wrapRepo?: (
    repo: MinistryInvitationRepository,
  ) => MinistryInvitationRepository;
}

/** Real managers, repositories and AuthorityService; only session and Active Church are seams. */
async function buildApp({ wrapRepo = (repo) => repo }: BuildAppInput = {}) {
  const harness = createMinistryInvitationTestHarness({ db });
  const instance = await createFastify({ locale: testLocale });
  const controller = new MinistryController({
    ministryManager: new DbMinistryManager({
      ministryRepo: harness.ministryRepository,
      volunteerRepo: harness.volunteerRepository,
      invitationRepo: wrapRepo(harness.ministryInvitationRepository),
      unitOfWork: harness.unitOfWork,
    }),
    ministryInvitationManager: harness.manager,
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
  worshipLeaderVolunteerId: string;
  worshipId: string;
  kidsId: string;
  foreignMinistryId: string;
  helperId: string;
}
let fx: Fixture;

async function persona(
  key: Persona,
  churchAccess: 'admin' | 'member',
  churchId = CHURCH_A,
) {
  const userId = `archive-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@archive.test` });
  await buildChurchMembership({
    db,
    churchId,
    userId,
    accessLevel: churchAccess,
  });
  return userId;
}

async function seed() {
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'archive-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'archive-b',
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
  const userIds = {
    admin: await persona('admin', 'admin'),
    otherAdmin: await persona('otherAdmin', 'admin'),
    worshipLeader: await persona('worshipLeader', 'member'),
    invitee: await persona('invitee', 'member'),
    foreign: await persona('foreign', 'admin', CHURCH_B),
  };
  const leader = await buildVolunteer({
    db,
    churchId: CHURCH_A,
    userId: userIds.worshipLeader,
  });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: leader.id,
    ministryId: worship.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
  const helper = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: kids.id,
    name: 'Helper',
  });
  fx = {
    helperId: helper.id,
    userIds,
    worshipLeaderVolunteerId: leader.id,
    worshipId: worship.id,
    kidsId: kids.id,
    foreignMinistryId: foreign.id,
  };
}

function signIn(key: Persona) {
  mockGetSession.mockResolvedValue({
    user: { id: fx.userIds[key] },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: key === 'foreign' ? CHURCH_B : CHURCH_A,
    volunteerId: key === 'worshipLeader' ? fx.worshipLeaderVolunteerId : null,
    autoSelected: false,
  });
}

interface ChurchOfferInput {
  id: string;
  email: string;
  role?: 'admin' | 'member';
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
  churchId?: string;
}

async function churchOffer(input: ChurchOfferInput) {
  await db.insert(churchInvitation).values({
    id: input.id,
    organizationId: input.churchId ?? CHURCH_A,
    email: input.email,
    role: input.role ?? 'member',
    status: input.status ?? 'pending',
    expiresAt: input.expiresAt ?? FUTURE,
    inviterId: fx.userIds.worshipLeader,
    createdAt: CREATED_AT,
  });
}

interface MinistryOfferInput {
  ministryId?: string;
  churchInvitationId?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt?: Date;
  churchId?: string;
  inviteeUserId?: string;
}

async function ministryOffer(input: MinistryOfferInput = {}) {
  const id = randomUUID();
  const isPaired = input.churchInvitationId !== undefined;
  await db.insert(ministryInvitation).values({
    id,
    churchId: input.churchId ?? CHURCH_A,
    ministryId: input.ministryId ?? fx.worshipId,
    inviteeUserId: isPaired
      ? undefined
      : (input.inviteeUserId ?? fx.userIds.invitee),
    churchInvitationId: input.churchInvitationId,
    ministryAccessLevel: 'volunteer',
    status: input.status ?? 'pending',
    inviterId: fx.userIds.worshipLeader,
    expiresAt: input.expiresAt ?? FUTURE,
    createdAt: CREATED_AT,
  });
  return id;
}

function archive(ministryId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/archive`,
  });
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

/** Everything a refused or rolled-back archive must leave untouched. */
async function snapshot() {
  return {
    ministries: await db.select().from(ministry).orderBy(ministry.id),
    ministryRows: await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id),
    churchRows: await db
      .select()
      .from(churchInvitation)
      .orderBy(churchInvitation.id),
  };
}

/** The revocation facts an archive by `actor` at NOW records. */
function archivedBy(actor: Persona) {
  return {
    status: 'canceled',
    canceledById: fx.userIds[actor],
    canceledAt: toDate({ instant: NOW }),
    cancelReason: 'ministry-archived',
  };
}

const STILL_PENDING = {
  status: 'pending',
  canceledAt: null,
  canceledById: null,
  cancelReason: null,
};

describe('POST /ministries/:ministryId/archive — pending invitations', () => {
  it('revokes every pending invitation of the Ministry, expired included, as the archiving admin, keeping the original inviter', async () => {
    const pending = await ministryOffer();
    const expired = await ministryOffer({
      expiresAt: PAST,
      inviteeUserId: fx.userIds.otherAdmin,
    });
    signIn('admin');

    const res = await archive(fx.worshipId);

    expect(res.statusCode).toBe(204);
    for (const id of [pending, expired]) {
      expect(await invitationRow(id)).toMatchObject({
        ...archivedBy('admin'),
        inviterId: fx.userIds.worshipLeader,
      });
    }
  });
});

describe('POST /ministries/:ministryId/archive — shared Church offers', () => {
  it('revokes a Church Invitation whose last pending half is archived, with the same facts', async () => {
    await churchOffer({ id: 'ci-last', email: 'last@archive.test' });
    const half = await ministryOffer({ churchInvitationId: 'ci-last' });
    signIn('admin');

    expect((await archive(fx.worshipId)).statusCode).toBe(204);

    expect(await invitationRow(half)).toMatchObject(archivedBy('admin'));
    expect(await churchRow('ci-last')).toMatchObject({
      ...archivedBy('admin'),
      inviterId: fx.userIds.worshipLeader,
    });
  });

  it.each([
    ['a pending', FUTURE],
    ['an expired pending', PAST],
  ])('keeps the Church Invitation and %s half in another Ministry', async (_label, expiresAt) => {
    await churchOffer({ id: 'ci-shared', email: 'shared@archive.test' });
    const worshipHalf = await ministryOffer({
      churchInvitationId: 'ci-shared',
    });
    const kidsHalf = await ministryOffer({
      churchInvitationId: 'ci-shared',
      ministryId: fx.kidsId,
      expiresAt,
    });
    signIn('admin');

    expect((await archive(fx.worshipId)).statusCode).toBe(204);

    expect(await invitationRow(worshipHalf)).toMatchObject(archivedBy('admin'));
    expect(await churchRow('ci-shared')).toMatchObject(STILL_PENDING);
    expect(await invitationRow(kidsHalf)).toMatchObject(STILL_PENDING);
  });

  it('applies the last-half rule to an admin-upgraded Church Invitation', async () => {
    await churchOffer({
      id: 'ci-admin',
      email: 'upgraded@archive.test',
      role: 'admin',
    });
    await ministryOffer({ churchInvitationId: 'ci-admin' });
    signIn('admin');

    expect((await archive(fx.worshipId)).statusCode).toBe(204);
    expect(await churchRow('ci-admin')).toMatchObject({
      ...archivedBy('admin'),
      role: 'admin',
    });
  });

  it('leaves completed history, other Ministries and other Churches unchanged', async () => {
    await churchOffer({ id: 'ci-mixed', email: 'mixed@archive.test' });
    const closed = [
      await ministryOffer({ status: 'accepted' }),
      await ministryOffer({ status: 'rejected' }),
      await ministryOffer({ status: 'canceled' }),
      await ministryOffer({
        churchInvitationId: 'ci-mixed',
        status: 'accepted',
      }),
    ];
    await churchOffer({ id: 'ci-kids', email: 'kids@archive.test' });
    const kidsOnly = await ministryOffer({ ministryId: fx.kidsId });
    await churchOffer({
      id: 'ci-foreign',
      email: 'foreign@archive.test',
      churchId: CHURCH_B,
    });
    const foreign = await ministryOffer({
      churchId: CHURCH_B,
      ministryId: fx.foreignMinistryId,
      churchInvitationId: 'ci-foreign',
    });
    const untouched = async () => ({
      closed: await Promise.all(closed.map(invitationRow)),
      others: await Promise.all([kidsOnly, foreign].map(invitationRow)),
      parents: await Promise.all(
        ['ci-mixed', 'ci-kids', 'ci-foreign'].map(churchRow),
      ),
    });
    const before = await untouched();
    signIn('admin');

    expect((await archive(fx.worshipId)).statusCode).toBe(204);
    expect(await untouched()).toEqual(before);
  });
});

describe('POST /ministries/:ministryId/archive — refusals and rollback', () => {
  it('changes no invitation when an upcoming participation refuses the archive', async () => {
    const cycleRow = await buildCycle({
      db,
      churchId: CHURCH_A,
      name: 'Next',
      startDate: '2030-01-01' as never,
      endDate: '2030-12-31' as never,
      state: 'sent',
    });
    const eventRow = await buildEvent({
      db,
      churchId: CHURCH_A,
      cycleId: cycleRow.id,
      title: 'Upcoming',
      start: parseInstant({ value: '2030-02-01T12:00:00.000Z' }),
      end: parseInstant({ value: '2030-02-01T14:00:00.000Z' }),
      status: 'scheduled',
    });
    await buildMinistryParticipation({
      db,
      churchId: CHURCH_A,
      ministryId: fx.worshipId,
      eventId: eventRow.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    await churchOffer({ id: 'ci-blocked', email: 'blocked@archive.test' });
    await ministryOffer({ churchInvitationId: 'ci-blocked' });
    await ministryOffer();
    signIn('admin');
    const before = await snapshot();

    const res = await archive(fx.worshipId);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('MINISTRY_IN_USE');
    expect(await snapshot()).toEqual(before);
  });

  it('changes no invitation for a non-admin, an archived or a foreign Ministry', async () => {
    await ministryOffer();
    const archivedMinistry = await buildMinistry({
      db,
      churchId: CHURCH_A,
      name: 'Old',
    });
    await ministryOffer({ ministryId: archivedMinistry.id });
    await db
      .update(ministry)
      .set({ deletedAt: toDate({ instant: NOW }) })
      .where(eq(ministry.id, archivedMinistry.id));
    const before = await snapshot();

    signIn('worshipLeader');
    const leader = await archive(fx.worshipId);
    signIn('admin');
    const archived = await archive(archivedMinistry.id);
    const foreign = await archive(fx.foreignMinistryId);

    expect([leader, archived, foreign].map((res) => res.statusCode)).toEqual([
      403, 404, 404,
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['revoking the Church Invitation', 'cancelChurchInvitation'],
    ['revoking a later half', 'cancelMinistryInvitation'],
  ] as const)('rolls back the archive and every closure when %s fails', async (_label, method) => {
    let calls = 0;
    const failing = await buildApp({
      wrapRepo: (repo) =>
        Object.assign(Object.create(repo), {
          [method]: async (input: never) => {
            calls += 1;
            if (method === 'cancelMinistryInvitation' && calls === 1) {
              return repo[method](input);
            }
            throw new Error('Injected persistence failure');
          },
        }),
    });
    await churchOffer({ id: 'ci-fail', email: 'fail@archive.test' });
    await ministryOffer({ churchInvitationId: 'ci-fail' });
    await ministryOffer();
    signIn('admin');
    const before = await snapshot();

    const res = await failing.app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${fx.worshipId}/archive`,
    });
    await failing.app.close();

    expect(res.statusCode).toBe(500);
    expect(await snapshot()).toEqual(before);
  });
});

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

/** An archive of Worship held open right after it locked the Ministry, until released. */
async function heldArchive() {
  const locked = gate();
  const release = gate();
  const held = await buildApp({
    wrapRepo: (repo) =>
      Object.assign(Object.create(repo), {
        listPendingInMinistry: async (input: never) => {
          locked.open();
          await release.opened;
          return repo.listPendingInMinistry(input);
        },
      }),
  });
  const done = held.app
    .inject({
      method: 'POST',
      url: `/api/v1/ministries/${fx.worshipId}/archive`,
    })
    .finally(() => held.app.close());
  await locked.opened;
  return { release: release.open, done };
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

describe('POST /ministries/:ministryId/archive — concurrency', () => {
  it.each([
    'resend',
    'revoke',
  ] as const)('makes a %s that waited on the archive answer 404, keeping the archive facts', async (action) => {
    const id = await ministryOffer();
    signIn('admin');
    const held = await heldArchive();

    const racing = app.inject({
      method: 'POST',
      url: `/api/v1/ministries/${fx.worshipId}/invitations/${id}/${action}`,
    });
    await untilLockWait();
    held.release();

    expect((await held.done).statusCode).toBe(204);
    expect((await racing).statusCode).toBe(404);
    expect(await invitationRow(id)).toMatchObject({
      ...archivedBy('admin'),
      expiresAt: FUTURE,
      resendCount: 0,
    });
  });

  it('refuses a mint into the Ministry that waited on the archive', async () => {
    signIn('admin');
    const held = await heldArchive();

    const minting = harness.manager.mint({
      churchId: ChurchId.from(CHURCH_A),
      ministryId: MinistryId.from(fx.worshipId),
      inviterId: UserId.from(fx.userIds.admin),
      email: 'late@archive.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });
    const outcome = minting.then(
      () => 'minted',
      (error: Error) => error.name,
    );
    await untilLockWait();
    held.release();

    expect((await held.done).statusCode).toBe(204);
    expect(await outcome).not.toBe('minted');
    expect(
      await db
        .select()
        .from(ministryInvitation)
        .where(eq(ministryInvitation.ministryId, fx.worshipId)),
    ).toEqual([]);
  });

  it('keeps a shared Church offer for a sibling minted while the archive is in flight', async () => {
    const email = 'sibling@archive.test';
    await churchOffer({ id: 'ci-sibling', email });
    const worshipHalf = await ministryOffer({
      churchInvitationId: 'ci-sibling',
    });
    signIn('admin');
    const held = await heldArchive();

    const minted = await harness.manager.mint({
      churchId: ChurchId.from(CHURCH_A),
      ministryId: MinistryId.from(fx.kidsId),
      inviterId: UserId.from(fx.userIds.admin),
      email,
      ministryAccessLevel: 'volunteer',
      roleIds: [fx.helperId as never],
    });
    held.release();

    expect((await held.done).statusCode).toBe(204);
    expect(minted.churchInvitationId).toBe('ci-sibling');
    expect(await invitationRow(worshipHalf)).toMatchObject(archivedBy('admin'));
    expect(await churchRow('ci-sibling')).toMatchObject(STILL_PENDING);
    expect(await invitationRow(minted.id)).toMatchObject(STILL_PENDING);
  });

  it('refuses an acceptance that waited on the archive, without a deadlock', async () => {
    await churchOffer({ id: 'ci-accept', email: 'accept@archive.test' });
    const id = await ministryOffer({ churchInvitationId: 'ci-accept' });
    const redemption = new DrizzleRedemptionRepository({
      db,
      volunteerRepository: harness.volunteerRepository,
    });
    signIn('admin');
    const held = await heldArchive();

    const accepting = harness.unitOfWork
      .run((tx) =>
        redemption.acceptPendingMinistryInvitation({
          churchId: ChurchId.from(CHURCH_A),
          ministryInvitationId: id as never,
          userId: UserId.from(fx.userIds.invitee),
          acceptedAt: toDate({ instant: NOW }),
          correlationId: randomUUID(),
          auditAction: 'ministry_acceptance',
          tx,
        }),
      )
      .then(
        () => 'accepted',
        (error: Error) => error.name,
      );
    await untilLockWait();
    held.release();

    expect((await held.done).statusCode).toBe(204);
    expect(await accepting).toBe('PendingMinistryInvitationNotFoundError');
    expect(await invitationRow(id)).toMatchObject(archivedBy('admin'));
    expect(await churchRow('ci-accept')).toMatchObject(archivedBy('admin'));
  });

  it('leaves an acceptance that committed first untouched', async () => {
    const id = await ministryOffer();
    const redemption = new DrizzleRedemptionRepository({
      db,
      volunteerRepository: harness.volunteerRepository,
    });
    await harness.unitOfWork.run((tx) =>
      redemption.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(CHURCH_A),
        ministryInvitationId: id as never,
        userId: UserId.from(fx.userIds.invitee),
        acceptedAt: toDate({ instant: NOW }),
        correlationId: randomUUID(),
        auditAction: 'ministry_acceptance',
        tx,
      }),
    );
    signIn('admin');

    expect((await archive(fx.worshipId)).statusCode).toBe(204);
    expect(await invitationRow(id)).toMatchObject({
      status: 'accepted',
      canceledAt: null,
    });
  });
});
