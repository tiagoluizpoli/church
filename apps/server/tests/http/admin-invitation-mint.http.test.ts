import {
  invitation as churchInvitation,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
} from '@church/db';
import { m } from '@church/i18n/messages';
import {
  addMilliseconds,
  parseInstant,
  resetClock,
  setTestClock,
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
const CHURCH_A = '93333333-3333-4333-8333-333333333333';
const CHURCH_B = '94444444-4444-4444-8444-444444444444';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const DAY_MS = 24 * 60 * 60_000;

type Persona = 'admin' | 'worshipLeader' | 'member' | 'foreignUser';

let app: FastifyTypedInstance;
const harness = createMinistryInvitationTestHarness({ db });

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const authorityGuard = new AuthorityGuard({
    manager: harness.authorityManager,
  });
  // Real managers, repositories and AuthorityService; only session and Active Church are seams.
  const controllers = [
    new InvitationController({
      invitationListManager: {} as never,
      ministryInvitationManager: harness.manager,
      activeChurchResolver: activeChurchResolver as never,
      authorityGuard,
      maxPageSize: 50,
    }),
    new MinistryController({
      ministryManager: {} as never,
      ministryInvitationManager: harness.manager,
      activeChurchResolver: activeChurchResolver as never,
      authorityGuard,
    }),
  ];
  await app.register(
    async (instance) => {
      for (const controller of controllers) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      }
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
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
  singerId: string;
}
let fx: Fixture;

async function seed() {
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'admin-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({ db, id: CHURCH_B, name: 'B', slug: 'admin-b' });
  const worship = await buildMinistry({
    db,
    churchId: CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' });
  const singer = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: worship.id,
    name: 'Singer',
  });

  const user = async (
    key: Persona,
    churchId: string,
    access: 'admin' | 'member',
  ) => {
    const userId = `admin-mint-${key}`;
    await buildUser({ db, id: userId, name: key, email: `${key}@admin.test` });
    await buildChurchMembership({ db, churchId, userId, accessLevel: access });
    return userId;
  };
  const admin = await user('admin', CHURCH_A, 'admin');
  const worshipLeader = await user('worshipLeader', CHURCH_A, 'member');
  const leaderVolunteer = await buildVolunteer({
    db,
    churchId: CHURCH_A,
    userId: worshipLeader,
  });
  await buildMinistryMembership({
    db,
    churchId: CHURCH_A,
    volunteerId: leaderVolunteer.id,
    ministryId: worship.id,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
  const member = await user('member', CHURCH_A, 'member');
  const foreignUser = await user('foreignUser', CHURCH_B, 'member');

  fx = {
    userIds: { admin, worshipLeader, member, foreignUser },
    volunteerIds: { worshipLeader: leaderVolunteer.id },
    worshipId: worship.id,
    kidsId: kids.id,
    singerId: singer.id,
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

function inviteAdmin(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/invitations/admin',
    payload: { email },
  });
}

function mintVolunteer(ministryId: string, email: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/invitations`,
    payload: {
      email,
      ministryAccessLevel: 'volunteer',
      roleIds: [fx.singerId],
    },
  });
}

function mintLeader(ministryId: string, email: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ministries/${ministryId}/invitations`,
    payload: { email, ministryAccessLevel: 'leader', roleIds: [] },
  });
}

async function snapshot() {
  return {
    church: await db
      .select()
      .from(churchInvitation)
      .orderBy(churchInvitation.id),
    ministry: await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id),
    roles: await db
      .select()
      .from(ministryInvitationRole)
      .orderBy(ministryInvitationRole.id),
    outbox: await db.select().from(outboxMessage).orderBy(outboxMessage.id),
  };
}

async function churchOfferIntents() {
  return db
    .select({ payload: outboxMessage.payload })
    .from(outboxMessage)
    .where(eq(outboxMessage.kind, 'invitation.church-bootstrap'));
}

async function insertChurchOffer(
  id: string,
  values: Partial<typeof churchInvitation.$inferInsert> = {},
) {
  await db.insert(churchInvitation).values({
    id,
    organizationId: CHURCH_A,
    email: 'offer@admin.test',
    role: 'member',
    status: 'pending',
    expiresAt: new Date('2026-11-05T12:00:00.000Z'),
    inviterId: fx.userIds.admin,
    ...values,
  });
}

describe('POST /invitations/admin — creation and refusals', () => {
  it('creates one lower-cased admin Church offer and exactly one T1 intent', async () => {
    signIn('admin');
    const res = await inviteAdmin('  New.Admin@Admin.TEST ');

    expect(res.statusCode).toBe(201);
    const [row] = await db.select().from(churchInvitation);
    expect(row).toMatchObject({
      organizationId: CHURCH_A,
      email: 'new.admin@admin.test',
      role: 'admin',
      status: 'pending',
      inviterId: fx.userIds.admin,
      expiresAt: new Date('2026-11-09T12:00:00.000Z'),
    });
    expect(res.json()).toEqual({
      kind: 'church',
      id: row?.id,
      churchAccessLevel: 'admin',
      expiresAt: '2026-11-09T12:00:00.000Z',
      redemptionPath: `/invitations/church/${row?.id}`,
      deliveryStatus: 'pending',
      outcome: 'created',
    });
    expect(await churchOfferIntents()).toEqual([
      { payload: { churchInvitationId: row?.id } },
    ]);
    expect(await db.select().from(ministryInvitation)).toEqual([]);
    expect(await db.select().from(outboxMessage)).toHaveLength(1);
  });

  it.each([
    'worshipLeader',
    'member',
  ] as const)('forbids a non-admin caller (%s) with no writes', async (key) => {
    signIn(key);
    const before = await snapshot();

    const res = await inviteAdmin('someone@admin.test');

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(await snapshot()).toEqual(before);
  });

  it('sends an existing Church Member to People, matching case-insensitively, with no writes', async () => {
    signIn('admin');
    const before = await snapshot();

    const res = await inviteAdmin('MEMBER@admin.test');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'INVITEE_ALREADY_CHURCH_MEMBER',
      message: m.error_invitee_already_church_member(
        {},
        { locale: testLocale.defaultLocale },
      ),
    });
    expect(await snapshot()).toEqual(before);
  });

  it('treats a User of another Church as new to this Church', async () => {
    signIn('admin');
    const res = await inviteAdmin('foreignUser@admin.test');
    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['unexpired', new Date('2026-11-05T12:00:00.000Z')],
    ['expired', new Date('2026-10-01T12:00:00.000Z')],
  ])('refuses an %s pending admin offer without mutation or delivery', async (_label, expiresAt) => {
    signIn('admin');
    await insertChurchOffer('pending-admin', { role: 'admin', expiresAt });
    const before = await snapshot();

    const res = await inviteAdmin('Offer@admin.test');

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('PENDING_CHURCH_INVITATION_EXISTS');
    expect(await snapshot()).toEqual(before);
  });

  it('treats closed offers as history and creates a fresh one', async () => {
    signIn('admin');
    await insertChurchOffer('declined', { status: 'rejected' });
    await insertChurchOffer('revoked', { status: 'canceled', role: 'admin' });

    const res = await inviteAdmin('offer@admin.test');

    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toMatch(/declined|revoked/);
    const rows = await db.select().from(churchInvitation);
    expect(rows.map(({ id, status, role }) => ({ id, status, role }))).toEqual(
      expect.arrayContaining([
        { id: 'declined', status: 'rejected', role: 'member' },
        { id: 'revoked', status: 'canceled', role: 'admin' },
      ]),
    );
  });
});

describe('POST /invitations/admin — upgrading a paired member offer', () => {
  it('raises the same Church offer to admin, keeps every Ministry half and restarts the pair', async () => {
    signIn('admin');
    expect(
      (await mintVolunteer(fx.worshipId, 'pair@admin.test')).statusCode,
    ).toBe(201);
    expect((await mintLeader(fx.kidsId, 'pair@admin.test')).statusCode).toBe(
      201,
    );
    const resentAt = new Date('2026-11-02T13:00:00.000Z');
    await db
      .update(ministryInvitation)
      .set({
        resendCount: 2,
        lastResendAt: resentAt,
        resendWindowStartedAt: resentAt,
      })
      .where(eq(ministryInvitation.ministryId, fx.worshipId));
    const [member] = await db.select().from(churchInvitation);
    const halvesBefore = await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id);
    const rolesBefore = await db.select().from(ministryInvitationRole);

    // Past the member offer's expiry: the upgrade still issues a usable offer.
    const later = addMilliseconds({ instant: NOW, milliseconds: 10 * DAY_MS });
    setTestClock({ instant: later });
    const res = await inviteAdmin('PAIR@admin.test');

    expect(res.statusCode).toBe(200);
    const expected = new Date('2026-11-19T12:00:00.000Z');
    expect(res.json()).toMatchObject({
      kind: 'church',
      id: member?.id,
      churchAccessLevel: 'admin',
      expiresAt: expected.toISOString(),
      outcome: 'upgraded',
    });
    const churchRows = await db.select().from(churchInvitation);
    expect(churchRows).toEqual([
      { ...member, role: 'admin', expiresAt: expected },
    ]);
    const halvesAfter = await db
      .select()
      .from(ministryInvitation)
      .orderBy(ministryInvitation.id);
    expect(halvesAfter).toEqual(
      halvesBefore.map((half) => ({
        ...half,
        expiresAt: expected,
        updatedAt: expect.any(Date),
      })),
    );
    expect(await db.select().from(ministryInvitationRole)).toEqual(rolesBefore);
    expect(await churchOfferIntents()).toEqual([
      { payload: { churchInvitationId: member?.id } },
    ]);
  });

  it('does not treat a repeated admin invite after an upgrade as a resend', async () => {
    signIn('admin');
    await mintVolunteer(fx.worshipId, 'twice@admin.test');
    expect((await inviteAdmin('twice@admin.test')).statusCode).toBe(200);
    const before = await snapshot();

    const res = await inviteAdmin('twice@admin.test');

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('PENDING_CHURCH_INVITATION_EXISTS');
    expect(await snapshot()).toEqual(before);
  });

  it('lets a later Ministry invite reuse the admin offer without downgrading it', async () => {
    signIn('admin');
    const admin = await inviteAdmin('order@admin.test');
    const ministry = await mintVolunteer(fx.worshipId, 'order@admin.test');

    expect([admin.statusCode, ministry.statusCode]).toEqual([201, 201]);
    const [church] = await db.select().from(churchInvitation);
    expect(church).toMatchObject({ id: admin.json().id, role: 'admin' });
    const [half] = await db.select().from(ministryInvitation);
    expect(half?.churchInvitationId).toBe(church?.id);
  });

  it('rolls the upgrade back when the T1 intent cannot be written', async () => {
    signIn('admin');
    await mintVolunteer(fx.worshipId, 'rollback@admin.test');
    const before = await snapshot();
    vi.spyOn(
      harness.ministryInvitationRepository,
      'enqueueOutboxMessage',
    ).mockRejectedValueOnce(new Error('outbox down'));

    const res = await inviteAdmin('rollback@admin.test');

    expect(res.statusCode).toBe(500);
    expect(await snapshot()).toEqual(before);
  });

  it('rolls a new admin offer back when the T1 intent cannot be written', async () => {
    signIn('admin');
    vi.spyOn(
      harness.ministryInvitationRepository,
      'enqueueOutboxMessage',
    ).mockRejectedValueOnce(new Error('outbox down'));

    const res = await inviteAdmin('fresh@admin.test');

    expect(res.statusCode).toBe(500);
    expect(await db.select().from(churchInvitation)).toEqual([]);
  });
});

describe('POST /invitations/admin — races', () => {
  it('yields one pending Church offer at admin when an admin invite races Ministry invites', async () => {
    signIn('admin');
    const results = await Promise.all([
      mintVolunteer(fx.worshipId, 'race@admin.test'),
      inviteAdmin('Race@admin.test'),
      mintLeader(fx.kidsId, 'RACE@admin.test'),
    ]);

    expect(results.map((res) => res.statusCode)).toEqual([
      201,
      expect.any(Number),
      201,
    ]);
    expect([200, 201]).toContain(results[1]?.statusCode);
    const churchRows = await db.select().from(churchInvitation);
    expect(churchRows).toHaveLength(1);
    expect(churchRows[0]?.role).toBe('admin');
    const halves = await db.select().from(ministryInvitation);
    expect(halves.map((half) => half.churchInvitationId)).toEqual([
      churchRows[0]?.id,
      churchRows[0]?.id,
    ]);
    expect(await churchOfferIntents()).toHaveLength(1);
  });

  it('lets exactly one of two identical admin invites through', async () => {
    signIn('admin');
    const results = await Promise.all([
      inviteAdmin('same@admin.test'),
      inviteAdmin('SAME@admin.test'),
    ]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(await db.select().from(churchInvitation)).toHaveLength(1);
    expect(await churchOfferIntents()).toHaveLength(1);
  });
});
