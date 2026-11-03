import { randomUUID } from 'node:crypto';
import {
  invitation as churchInvitation,
  identityAudit,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
} from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
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
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbInvitationListManager } from '@/application/db-invitation-list-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleInvitationListRepository } from '@/infrastructure/repositories/drizzle-invitation-list.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
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

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);
const activeChurchResolver = { resolve: vi.fn() };

const db = schedulingTestDb;
const CHURCH_A = '81111111-1111-4111-8111-111111111111';
const CHURCH_B = '82222222-2222-4222-8222-222222222222';
const NOW = parseInstant({ value: '2026-11-02T12:00:00.000Z' });
const NOW_DATE = new Date('2026-11-02T12:00:00.000Z');
const FUTURE = new Date('2026-11-09T12:00:00.000Z');

type Persona =
  | 'admin'
  | 'worshipLeader'
  | 'multiLeader'
  | 'volunteer'
  | 'member';

let app: FastifyTypedInstance;

beforeAll(async () => {
  const ministryRepository = new DrizzleMinistryRepository({ db });
  app = await createFastify({ locale: testLocale });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository,
  });
  // Real manager, repository and AuthorityService; only session and Active Church are seams.
  const controller = new InvitationController({
    invitationListManager: new DbInvitationListManager({
      invitationListRepository: new DrizzleInvitationListRepository({ db }),
      authorityManager,
      defaultPageSize: 20,
    }),
    ministryInvitationManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({ manager: authorityManager }),
    maxPageSize: 50,
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
  singerId: string;
  drumsId: string;
}
let fx: Fixture;

async function persona(
  key: Persona,
  ledMinistryIds: string[],
  churchAccess: 'admin' | 'member',
) {
  const userId = `inv-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@inv.test` });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId,
    accessLevel: churchAccess,
  });
  if (ledMinistryIds.length === 0 && key !== 'volunteer') return { userId };
  const volunteer = await buildVolunteer({ db, churchId: CHURCH_A, userId });
  for (const ministryId of ledMinistryIds) {
    await buildMinistryMembership({
      db,
      churchId: CHURCH_A,
      volunteerId: volunteer.id,
      ministryId,
      ministryAccessLevel: key === 'volunteer' ? 'volunteer' : 'leader',
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
    slug: 'inv-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'inv-b',
    timezone: 'UTC',
  });
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
  const drums = await buildRole({
    db,
    churchId: CHURCH_A,
    ministryId: worship.id,
    name: 'Drums',
  });
  const admin = await persona('admin', [], 'admin');
  const worshipLeader = await persona('worshipLeader', [worship.id], 'member');
  const multiLeader = await persona(
    'multiLeader',
    [worship.id, kids.id],
    'member',
  );
  const volunteer = await persona('volunteer', [worship.id], 'member');
  const member = await persona('member', [], 'member');
  fx = {
    userIds: {
      admin: admin.userId,
      worshipLeader: worshipLeader.userId,
      multiLeader: multiLeader.userId,
      volunteer: volunteer.userId,
      member: member.userId,
    },
    volunteerIds: {
      worshipLeader: worshipLeader.volunteerId,
      multiLeader: multiLeader.volunteerId,
      volunteer: volunteer.volunteerId,
    },
    worshipId: worship.id,
    kidsId: kids.id,
    singerId: singer.id,
    drumsId: drums.id,
  };
}

function signIn(key: Persona, churchId = CHURCH_A) {
  mockGetSession.mockResolvedValue({
    user: { id: fx.userIds[key] },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId,
    volunteerId: fx.volunteerIds[key] ?? null,
    autoSelected: false,
  });
}

interface Row {
  kind: string;
  id: string;
  churchInvitationId?: string;
  ministryId?: string;
  ministryName?: string;
  email: string;
  churchAccessLevel?: string;
  ministryAccessLevel?: string;
  roles: { name: string }[];
  displayStatus: string;
  status: string;
  emailDelivery: { state: string; sentAt?: string };
  lastSentAt: string | null;
  canResend: boolean;
  canRevoke: boolean;
  closure?: {
    actor?: { id: string; name: string };
    at?: string;
    reason?: string;
  };
}

async function list(query = '') {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/invitations${query}`,
  });
  return { res, items: (res.json().items ?? []) as Row[], body: res.json() };
}

interface ChurchOfferInput {
  id: string;
  email: string;
  role: 'admin' | 'member';
  createdAt?: Date;
  expiresAt?: Date;
  status?: string;
  churchId?: string;
  acceptedAt?: Date;
  acceptedById?: string;
  declinedAt?: Date;
  canceledAt?: Date;
  canceledById?: string;
  cancelReason?: 'manual' | 'ministry-archived';
}
async function churchOffer(input: ChurchOfferInput) {
  await db.insert(churchInvitation).values({
    id: input.id,
    organizationId: input.churchId ?? CHURCH_A,
    email: input.email,
    role: input.role,
    status: input.status ?? 'pending',
    expiresAt: input.expiresAt ?? FUTURE,
    inviterId: fx.userIds.admin,
    acceptedAt: input.acceptedAt,
    acceptedById: input.acceptedById,
    declinedAt: input.declinedAt,
    canceledAt: input.canceledAt,
    canceledById: input.canceledById,
    cancelReason: input.cancelReason,
    createdAt: input.createdAt ?? new Date('2026-11-01T10:00:00.000Z'),
  });
}

interface MinistryOfferInput {
  ministryId: string;
  level?: 'leader' | 'volunteer';
  inviteeUserId?: string;
  churchInvitationId?: string;
  roleIds?: string[];
  createdAt?: Date;
  expiresAt?: Date;
  status?: 'pending' | 'accepted' | 'rejected' | 'canceled';
  acceptedAt?: Date;
  declinedAt?: Date;
  canceledAt?: Date;
  canceledById?: string;
  cancelReason?: 'manual' | 'ministry-archived';
  churchId?: string;
}
async function ministryOffer(input: MinistryOfferInput) {
  const id = randomUUID();
  await db.insert(ministryInvitation).values({
    id,
    churchId: input.churchId ?? CHURCH_A,
    ministryId: input.ministryId,
    inviteeUserId: input.inviteeUserId,
    churchInvitationId: input.churchInvitationId,
    ministryAccessLevel: input.level ?? 'volunteer',
    status: input.status ?? 'pending',
    inviterId: fx.userIds.worshipLeader,
    expiresAt: input.expiresAt ?? FUTURE,
    acceptedAt: input.acceptedAt,
    declinedAt: input.declinedAt,
    canceledAt: input.canceledAt,
    canceledById: input.canceledById,
    cancelReason: input.cancelReason,
    createdAt: input.createdAt ?? new Date('2026-11-01T10:00:00.000Z'),
  });
  for (const roleId of input.roleIds ?? []) {
    await db.insert(ministryInvitationRole).values({
      churchId: input.churchId ?? CHURCH_A,
      ministryInvitationId: id,
      roleId,
    });
  }
  return id;
}

interface OutboxInput {
  kind: 'invitation.chained' | 'notification' | 'invitation.church-bootstrap';
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  channelOutcomes?: Record<string, string>;
  sentAt?: Date;
  emailDeliveredAt?: Date;
  createdAt?: Date;
}
async function outbox(input: OutboxInput) {
  await db.insert(outboxMessage).values({
    churchId: CHURCH_A,
    kind: input.kind,
    payload: input.payload,
    status: input.status,
    channelOutcomes: input.channelOutcomes,
    sentAt: input.sentAt,
    emailDeliveredAt: input.emailDeliveredAt,
    scheduledFor: NOW_DATE,
    correlationId: randomUUID(),
    createdAt: input.createdAt ?? new Date('2026-11-01T10:00:01.000Z'),
  });
}

describe('GET /api/v1/invitations — access', () => {
  it('answers 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const { res } = await list();
    expect(res.statusCode).toBe(401);
  });

  it.each([
    'volunteer',
    'member',
  ] as const)('answers 403 to a %s', async (key) => {
    signIn(key);
    const { res } = await list();
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('lets a ChurchAdmin without a Volunteer profile list an empty Church', async () => {
    signIn('admin');
    const { res, items } = await list();
    expect(res.statusCode).toBe(200);
    expect(items).toEqual([]);
  });
});

describe('GET /api/v1/invitations — scope and identity', () => {
  let paired: string;
  let kidsOnly: string;

  beforeEach(async () => {
    const existing = fx.userIds.member;
    await ministryOffer({
      ministryId: fx.worshipId,
      level: 'leader',
      inviteeUserId: existing,
      roleIds: [fx.singerId, fx.drumsId],
    });
    await churchOffer({
      id: 'ci-member',
      email: 'new@inv.test',
      role: 'member',
    });
    kidsOnly = await ministryOffer({
      ministryId: fx.kidsId,
      churchInvitationId: 'ci-member',
    });
    await churchOffer({
      id: 'ci-admin',
      email: 'pair@inv.test',
      role: 'admin',
    });
    paired = await ministryOffer({
      ministryId: fx.worshipId,
      level: 'leader',
      churchInvitationId: 'ci-admin',
    });
    await churchOffer({
      id: 'ci-standalone',
      email: 'solo@inv.test',
      role: 'admin',
    });
    // Not pending, closed, archived, or another Church: never listed.
    await ministryOffer({
      ministryId: fx.worshipId,
      status: 'accepted',
      inviteeUserId: fx.userIds.volunteer,
    });
    await churchOffer({
      id: 'ci-accepted',
      email: 'done@inv.test',
      role: 'admin',
      status: 'accepted',
    });
    const archived = await buildMinistry({
      db,
      churchId: CHURCH_A,
      name: 'Old',
    });
    await ministryOffer({
      ministryId: archived.id,
      inviteeUserId: fx.userIds.volunteer,
    });
    await db
      .update(ministry)
      .set({ deletedAt: NOW_DATE })
      .where(eq(ministry.id, archived.id));
    const foreign = await buildMinistry({
      db,
      churchId: CHURCH_B,
      name: 'Foreign',
    });
    await churchOffer({
      id: 'ci-foreign',
      email: 'b@inv.test',
      role: 'admin',
      churchId: CHURCH_B,
    });
    await ministryOffer({
      ministryId: foreign.id,
      churchId: CHURCH_B,
      churchInvitationId: 'ci-foreign',
    });
  });

  it('shows an admin every Ministry offer and admin Church grant once, with no member-level Church row', async () => {
    signIn('admin');
    const { items } = await list();

    expect(items.map((i) => `${i.kind}:${i.email}`).sort()).toEqual([
      'church:pair@inv.test',
      'church:solo@inv.test',
      'ministry:member@inv.test',
      'ministry:new@inv.test',
      'ministry:pair@inv.test',
    ]);
    const roleOffer = items.find((i) => i.email === 'member@inv.test');
    expect(roleOffer?.roles.map((r) => r.name)).toEqual(['Drums', 'Singer']);
    expect(roleOffer?.ministryAccessLevel).toBe('leader');
    const pairRows = items.filter((i) => i.email === 'pair@inv.test');
    expect(pairRows.map((r) => r.churchInvitationId)).toEqual([
      'ci-admin',
      'ci-admin',
    ]);
    expect(pairRows.map((r) => r.churchAccessLevel)).toEqual([
      'admin',
      'admin',
    ]);
    expect(items.find((i) => i.id === paired)?.kind).toBe('ministry');
    expect(
      items.find((i) => i.id === kidsOnly)?.churchAccessLevel,
    ).toBeUndefined();
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('shows a one-Ministry leader only that Ministry, without Church-wide facts', async () => {
    signIn('worshipLeader');
    const { items } = await list();

    expect(
      items.every(
        (i) => i.kind === 'ministry' && i.ministryId === fx.worshipId,
      ),
    ).toBe(true);
    expect(items.map((i) => i.email).sort()).toEqual([
      'member@inv.test',
      'pair@inv.test',
    ]);
    expect(
      items.every(
        (i) =>
          i.churchInvitationId === undefined &&
          i.churchAccessLevel === undefined,
      ),
    ).toBe(true);
  });

  it('shows a multi-Ministry leader each led Ministry and nothing standalone', async () => {
    signIn('multiLeader');
    const { items } = await list();

    expect(items.map((i) => i.email).sort()).toEqual([
      'member@inv.test',
      'new@inv.test',
      'pair@inv.test',
    ]);
    expect(items.some((i) => i.kind === 'church')).toBe(false);
  });

  it('sees nothing of the other Church', async () => {
    signIn('admin');
    const { items } = await list();
    expect(items.map((i) => i.email)).not.toContain('b@inv.test');
  });
});

describe('GET /api/v1/invitations — row actions', () => {
  beforeEach(async () => {
    await ministryOffer({
      ministryId: fx.worshipId,
      level: 'volunteer',
      inviteeUserId: fx.userIds.member,
    });
    await ministryOffer({
      ministryId: fx.worshipId,
      level: 'leader',
      inviteeUserId: fx.userIds.volunteer,
      expiresAt: NOW_DATE,
    });
    await churchOffer({
      id: 'ci-closed',
      email: 'closed@inv.test',
      role: 'member',
      status: 'canceled',
    });
    await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: 'ci-closed',
    });
    await churchOffer({ id: 'ci-solo', email: 'solo@inv.test', role: 'admin' });
  });

  it('lets an admin resend every pending or expired row but no closed one', async () => {
    signIn('admin');
    const { items } = await list();

    const actions = Object.fromEntries(
      items.map((i) => [`${i.kind}:${i.email}`, i.canResend]),
    );
    expect(actions).toEqual({
      'church:solo@inv.test': true,
      'ministry:member@inv.test': true,
      'ministry:volunteer@inv.test': true,
      'ministry:closed@inv.test': false,
    });
  });

  it('lets a leader resend only volunteer-level rows', async () => {
    signIn('worshipLeader');
    const { items } = await list();

    const actions = Object.fromEntries(
      items.map((i) => [i.email, i.canResend]),
    );
    expect(actions).toEqual({
      'member@inv.test': true,
      'volunteer@inv.test': false,
      'closed@inv.test': false,
    });
  });

  it('lets an admin revoke every stored-pending row, Church rows and closed-parent halves included', async () => {
    signIn('admin');
    const { items } = await list();

    const actions = Object.fromEntries(
      items.map((i) => [`${i.kind}:${i.email}`, i.canRevoke]),
    );
    expect(actions).toEqual({
      'church:solo@inv.test': true,
      'ministry:member@inv.test': true,
      'ministry:volunteer@inv.test': true,
      'ministry:closed@inv.test': true,
    });
  });

  it('lets a leader revoke only volunteer-level rows', async () => {
    signIn('worshipLeader');
    const { items } = await list();

    const actions = Object.fromEntries(
      items.map((i) => [i.email, i.canRevoke]),
    );
    expect(actions).toEqual({
      'member@inv.test': true,
      'volunteer@inv.test': false,
      'closed@inv.test': true,
    });
  });

  it('never offers resend on history', async () => {
    await ministryOffer({
      ministryId: fx.worshipId,
      status: 'accepted',
      inviteeUserId: fx.userIds.multiLeader,
    });
    signIn('admin');
    const { items } = await list('?status=accepted');
    expect(items.map((i) => i.canResend)).toEqual([false]);
    expect(items.map((i) => i.canRevoke)).toEqual([false]);
  });
});

describe('GET /api/v1/invitations — expiry', () => {
  it('badges an offer expiring exactly now as expired and one a moment later as pending', async () => {
    await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.member,
      expiresAt: NOW_DATE,
    });
    await ministryOffer({
      ministryId: fx.kidsId,
      inviteeUserId: fx.userIds.member,
      expiresAt: new Date(NOW_DATE.getTime() + 1),
    });
    signIn('admin');

    const { items } = await list();

    expect(items.map((i) => [i.ministryId, i.displayStatus, i.status])).toEqual(
      expect.arrayContaining([
        [fx.worshipId, 'expired', 'pending'],
        [fx.kidsId, 'pending', 'pending'],
      ]),
    );
  });
});

describe('GET /api/v1/invitations — email delivery', () => {
  async function stateOf(id: string) {
    signIn('admin');
    const { items } = await list();
    return items.find((i) => i.id === id)?.emailDelivery;
  }

  it('reports unavailable when no email attempt exists', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.member,
    });
    expect(await stateOf(id)).toEqual({ state: 'unavailable' });
  });

  it('reports queued and processing rows as pending', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: await seedChurch('c1'),
    });
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: id },
      status: 'processing',
    });
    expect(await stateOf(id)).toEqual({ state: 'pending' });
  });

  it('reports a sent email with its actual send time only', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: await seedChurch('c2'),
    });
    const sentAt = new Date('2026-11-01T10:00:05.000Z');
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: id },
      status: 'sent',
      sentAt,
    });
    expect(await stateOf(id)).toEqual({
      state: 'sent',
      sentAt: sentAt.toISOString(),
    });
  });

  it('reports a failed email', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: await seedChurch('c3'),
    });
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: id },
      status: 'failed',
    });
    expect(await stateOf(id)).toEqual({ state: 'failed' });
  });

  it('reports a Notification whose email sink was skipped as unavailable, not sent', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.member,
    });
    await outbox({
      kind: 'notification',
      payload: {
        kind: 'ministry_invitation',
        data: { ministryInvitationId: id },
      },
      status: 'sent',
      channelOutcomes: { email: 'skipped', inbox: 'delivered' },
      sentAt: NOW_DATE,
    });
    expect(await stateOf(id)).toEqual({ state: 'unavailable' });
  });

  it('reports a Notification email as sent only when the email sink delivered it, using the latest attempt', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.member,
    });
    const payload = {
      kind: 'ministry_invitation',
      data: { ministryInvitationId: id },
    };
    await outbox({
      kind: 'notification',
      payload,
      status: 'failed',
      channelOutcomes: { email: 'failed' },
      createdAt: new Date('2026-11-01T10:00:01.000Z'),
    });
    const delivered = new Date('2026-11-01T11:00:00.000Z');
    await outbox({
      kind: 'notification',
      payload,
      status: 'sent',
      channelOutcomes: { email: 'delivered', inbox: 'delivered' },
      emailDeliveredAt: delivered,
      createdAt: new Date('2026-11-01T11:00:00.000Z'),
    });
    expect(await stateOf(id)).toEqual({
      state: 'sent',
      sentAt: delivered.toISOString(),
    });
  });

  it("reports an upgraded pair's halves from the offer's one T1 once it is their latest email", async () => {
    await churchOffer({ id: 'ci-pair', email: 'pair@inv.test', role: 'admin' });
    const resent = await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: 'ci-pair',
    });
    const superseded = await ministryOffer({
      ministryId: fx.kidsId,
      churchInvitationId: 'ci-pair',
    });
    const t1 = new Date('2026-11-02T11:00:00.000Z');
    const earlier = new Date('2026-11-01T10:00:05.000Z');
    await outbox({
      kind: 'invitation.church-bootstrap',
      payload: { churchInvitationId: 'ci-pair' },
      status: 'sent',
      sentAt: t1,
      createdAt: new Date('2026-11-02T10:59:00.000Z'),
    });
    // Sent before the upgrade; a later attempt failed, so only lastSentAt remembers the send.
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: resent },
      status: 'sent',
      sentAt: earlier,
    });
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: resent },
      status: 'failed',
      createdAt: new Date('2026-11-01T10:00:09.000Z'),
    });
    await outbox({
      kind: 'invitation.chained',
      payload: { ministryInvitationId: superseded },
      status: 'failed',
    });

    signIn('admin');
    const { items } = await list();
    const byId = (id: string) => items.find((i) => i.id === id);

    expect(byId('ci-pair')?.lastSentAt).toBe(t1.toISOString());
    // The T1 names every pending half, so it is each half's latest delivery.
    for (const half of [resent, superseded]) {
      expect(byId(half)).toMatchObject({
        churchInvitationId: 'ci-pair',
        emailDelivery: { state: 'sent' },
        lastSentAt: t1.toISOString(),
      });
    }
  });

  it('shows no delivery for a standalone admin grant that was never emailed', async () => {
    await churchOffer({ id: 'ci-solo', email: 'solo@inv.test', role: 'admin' });
    signIn('admin');
    const { items } = await list();
    expect(items[0]?.emailDelivery).toEqual({ state: 'unavailable' });
  });
});

async function seedChurch(id: string) {
  await churchOffer({ id, email: `${id}@inv.test`, role: 'member' });
  return id;
}

describe('GET /api/v1/invitations — pagination', () => {
  beforeEach(async () => {
    // Equal creation instants across both kinds force the kind/id tie-break.
    const tie = new Date('2026-11-01T09:00:00.000Z');
    for (let n = 0; n < 4; n++) {
      await churchOffer({
        id: `ci-tie-${n}`,
        email: `tie${n}@inv.test`,
        role: 'admin',
        createdAt: tie,
      });
      await ministryOffer({
        ministryId: fx.worshipId,
        churchInvitationId: `ci-tie-${n}`,
        createdAt: tie,
        roleIds: [fx.singerId, fx.drumsId],
      });
    }
    await ministryOffer({
      ministryId: fx.kidsId,
      inviteeUserId: fx.userIds.member,
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
    });
  });

  it('walks every row exactly once in a stable newest-first order and clears the cursor at the end', async () => {
    signIn('admin');
    const all = (await list('?limit=50')).items;
    expect(new Set(all.map((i) => `${i.kind}:${i.id}`)).size).toBe(all.length);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { body } = await list(
        `?limit=3${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...(body.items as Row[]).map((i) => `${i.kind}:${i.id}`));
      cursor = body.nextCursor;
      pages++;
      expect(pages).toBeLessThan(10);
    } while (cursor);

    expect(seen).toEqual(all.map((i) => `${i.kind}:${i.id}`));
    expect(all[0]?.ministryId).toBe(fx.kidsId);
  });

  it('refuses a malformed cursor and an over-limit page', async () => {
    signIn('admin');
    expect((await list('?cursor=not-a-cursor')).res.statusCode).toBe(422);
    expect((await list('?limit=51')).res.statusCode).toBe(422);
  });

  it('never leaks a standalone grant through a leader cursor', async () => {
    signIn('worshipLeader');
    const { body } = await list('?limit=2');
    const rest = body.nextCursor
      ? (await list(`?limit=50&cursor=${body.nextCursor}`)).items
      : [];
    expect(
      [...(body.items as Row[]), ...rest].every((i) => i.kind === 'ministry'),
    ).toBe(true);
  });
});

describe('GET /api/v1/invitations — filters and history', () => {
  const T = (iso: string) => new Date(iso);

  beforeEach(async () => {
    await ministryOffer({
      ministryId: fx.worshipId,
      level: 'volunteer',
      inviteeUserId: fx.userIds.member,
      createdAt: T('2026-10-01T00:00:00.000Z'),
    });
    await ministryOffer({
      ministryId: fx.worshipId,
      level: 'leader',
      inviteeUserId: fx.userIds.volunteer,
      status: 'accepted',
      acceptedAt: T('2026-10-02T00:00:00.000Z'),
      createdAt: T('2026-10-02T00:00:00.000Z'),
    });
    await ministryOffer({
      ministryId: fx.kidsId,
      inviteeUserId: fx.userIds.volunteer,
      status: 'rejected',
      declinedAt: T('2026-10-03T00:00:00.000Z'),
      createdAt: T('2026-10-03T00:00:00.000Z'),
    });
    await ministryOffer({
      ministryId: fx.kidsId,
      inviteeUserId: fx.userIds.member,
      status: 'canceled',
      canceledAt: T('2026-10-04T00:00:00.000Z'),
      createdAt: T('2026-10-04T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-done',
      email: 'Done@Inv.test',
      role: 'admin',
      status: 'accepted',
      acceptedAt: T('2026-10-05T00:00:00.000Z'),
      acceptedById: fx.userIds.member,
      createdAt: T('2026-10-05T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-no',
      email: 'no@inv.test',
      role: 'admin',
      status: 'rejected',
      declinedAt: T('2026-10-06T00:00:00.000Z'),
      createdAt: T('2026-10-06T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-old',
      email: 'old@inv.test',
      role: 'admin',
      status: 'rejected',
      createdAt: T('2026-10-07T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-gone',
      email: 'gone@inv.test',
      role: 'admin',
      status: 'canceled',
      createdAt: T('2026-10-08T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-late',
      email: 'late@inv.test',
      role: 'admin',
      expiresAt: NOW_DATE,
      createdAt: T('2026-10-09T00:00:00.000Z'),
    });
    await churchOffer({
      id: 'ci-fresh',
      email: 'fresh@inv.test',
      role: 'admin',
      expiresAt: new Date(NOW_DATE.getTime() + 1),
      createdAt: T('2026-10-10T00:00:00.000Z'),
    });
  });

  it('defaults to Pending with expired badged and Expired holding only the exact-boundary offer', async () => {
    signIn('admin');
    const pending = (await list()).items;
    expect(pending.map((r) => r.displayStatus).sort()).toEqual([
      'expired',
      'pending',
      'pending',
    ]);
    const expired = (await list('?status=expired')).items;
    expect(expired.map((r) => r.email)).toEqual(['late@inv.test']);
    expect(expired[0]?.status).toBe('pending');
  });

  it('maps accepted, declined and revoked onto the storage words', async () => {
    signIn('admin');
    const accepted = (await list('?status=accepted')).items;
    expect(accepted.map((r) => [r.kind, r.displayStatus, r.status])).toEqual([
      ['church', 'accepted', 'accepted'],
      ['ministry', 'accepted', 'accepted'],
    ]);
    const declined = (await list('?status=declined')).items;
    expect(declined.map((r) => r.displayStatus)).toEqual([
      'declined',
      'declined',
      'declined',
    ]);
    expect(declined.every((r) => r.status === 'rejected')).toBe(true);
    const revoked = (await list('?status=revoked')).items;
    expect(revoked.map((r) => [r.kind, r.displayStatus, r.status])).toEqual([
      ['church', 'revoked', 'canceled'],
      ['ministry', 'revoked', 'canceled'],
    ]);
  });

  it('combines status, Ministry, invited-as and case-insensitive email before paging', async () => {
    signIn('admin');
    expect(
      (
        await list(
          `?status=accepted&ministryId=${fx.worshipId}&invitedAs=leader`,
        )
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await list(
          `?status=accepted&ministryId=${fx.worshipId}&invitedAs=volunteer`,
        )
      ).items,
    ).toHaveLength(0);
    expect(
      (await list('?status=accepted&invitedAs=admin')).items.map(
        (r) => r.email,
      ),
    ).toEqual(['Done@Inv.test']);
    expect((await list('?status=accepted&email=DONE@')).items).toHaveLength(1);
    // Ministry rows match the addressed user's email; wildcards are literal.
    expect(
      (await list('?status=accepted&email=volunteer%40inv')).items,
    ).toHaveLength(1);
    expect((await list('?status=accepted&email=%25')).items).toHaveLength(0);
    // A Ministry filter excludes standalone Church grants.
    expect(
      (await list(`?status=accepted&ministryId=${fx.worshipId}`)).items.every(
        (r) => r.kind === 'ministry',
      ),
    ).toBe(true);
    // Filtering before the limit: the next page is of the filtered set only.
    const first = await list('?status=declined&limit=2');
    expect(first.items).toHaveLength(2);
    const second = await list(
      `?status=declined&limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it('scopes options and rows for leaders and gives unmanaged Ministries the same 404 as missing ones', async () => {
    signIn('admin');
    const adminBody = (await list()).body;
    expect(adminBody.options.invitedAs).toEqual([
      'admin',
      'leader',
      'volunteer',
    ]);
    expect(
      adminBody.options.ministries.map((m: { name: string }) => m.name),
    ).toEqual(['Kids', 'Worship']);

    signIn('worshipLeader');
    const leader = (await list('?status=accepted')).body;
    expect(leader.options.invitedAs).toEqual(['leader', 'volunteer']);
    expect(
      leader.options.ministries.map((m: { name: string }) => m.name),
    ).toEqual(['Worship']);
    expect(
      leader.items.every(
        (r: Row) => r.kind === 'ministry' && r.ministryId === fx.worshipId,
      ),
    ).toBe(true);
    expect((await list('?status=accepted&invitedAs=admin')).items).toEqual([]);
    const foreign = await buildMinistry({
      db,
      churchId: CHURCH_B,
      name: 'Foreign',
    });
    const unmanaged = await list(`?ministryId=${fx.kidsId}`);
    const missing = await list(`?ministryId=${randomUUID()}`);
    const otherChurch = await list(`?ministryId=${foreign.id}`);
    for (const r of [unmanaged, missing, otherChurch])
      expect(r.res.statusCode).toBe(404);
    expect(unmanaged.res.json()).toEqual(missing.res.json());
    expect((await list('?ministryId=nope')).res.statusCode).toBe(422);

    signIn('multiLeader');
    expect((await list()).body.options.ministries).toHaveLength(2);
  });

  it('reports only recorded closure facts and leaves old history explicitly unknown', async () => {
    const [ministryAccepted] = (
      await db
        .select()
        .from(ministryInvitation)
        .where(eq(ministryInvitation.status, 'accepted'))
    ).map((r) => r.id);
    await db.insert(identityAudit).values({
      churchId: CHURCH_A,
      ministryInvitationId: ministryAccepted as string,
      actorId: fx.userIds.volunteer,
      action: 'ministry_acceptance',
      correlationId: 'c1',
      timestamp: T('2026-10-02T01:00:00.000Z'),
    });
    signIn('admin');
    const accepted = (await list('?status=accepted')).items;
    const church = accepted.find((r) => r.kind === 'church');
    expect(church?.closure).toMatchObject({
      actor: { id: fx.userIds.member, name: 'member' },
    });
    expect(church?.closure?.at).toBeDefined();
    const ministryRow = accepted.find((r) => r.kind === 'ministry');
    expect(ministryRow?.closure?.actor?.name).toBe('volunteer');
    // The audit time wins over the row stamp.
    expect(ministryRow?.closure?.at).toBe('2026-10-02T01:00:00.000Z');

    const declined = (await list('?status=declined')).items;
    const publicDecline = declined.find((r) => r.email === 'no@inv.test');
    expect(publicDecline?.closure?.actor).toBeUndefined();
    expect(publicDecline?.closure?.at).toBe('2026-10-06T00:00:00.000Z');
    const legacy = declined.find((r) => r.email === 'old@inv.test');
    expect(legacy?.closure?.actor).toBeUndefined();
    expect(legacy?.closure?.at).toBeUndefined();

    const revoked = (await list('?status=revoked')).items;
    for (const row of revoked) expect(row.closure?.actor).toBeUndefined();
    expect(revoked.find((r) => r.kind === 'ministry')?.closure?.at).toBe(
      '2026-10-04T00:00:00.000Z',
    );
    expect(
      revoked.find((r) => r.kind === 'church')?.closure?.at,
    ).toBeUndefined();
  });

  it('shows who revoked, when and why, for Ministry rows, canceled admin parents and archived Ministries', async () => {
    const at = T('2026-10-20T00:00:00.000Z');
    await churchOffer({
      id: 'ci-upgraded',
      email: 'upgraded@inv.test',
      role: 'admin',
      status: 'canceled',
      canceledAt: at,
      canceledById: fx.userIds.worshipLeader,
      cancelReason: 'manual',
      createdAt: T('2026-10-11T00:00:00.000Z'),
    });
    await ministryOffer({
      ministryId: fx.worshipId,
      churchInvitationId: 'ci-upgraded',
      status: 'canceled',
      canceledAt: at,
      canceledById: fx.userIds.worshipLeader,
      cancelReason: 'manual',
      createdAt: T('2026-10-11T00:00:00.000Z'),
    });
    const archived = await buildMinistry({
      db,
      churchId: CHURCH_A,
      name: 'Closed choir',
    });
    await ministryOffer({
      ministryId: archived.id,
      inviteeUserId: fx.userIds.member,
      status: 'canceled',
      canceledAt: at,
      canceledById: fx.userIds.admin,
      cancelReason: 'ministry-archived',
      createdAt: T('2026-10-12T00:00:00.000Z'),
    });
    await db
      .update(ministry)
      .set({ deletedAt: NOW_DATE })
      .where(eq(ministry.id, archived.id));
    signIn('admin');

    const revoked = (await list('?status=revoked')).items;
    const closure = (kind: string, email: string) =>
      revoked.find((r) => r.kind === kind && r.email === email);

    const expected = {
      actor: { id: fx.userIds.worshipLeader, name: 'worshipLeader' },
      at: '2026-10-20T00:00:00.000Z',
      reason: 'manual',
    };
    expect(closure('church', 'upgraded@inv.test')?.closure).toEqual(expected);
    expect(closure('ministry', 'upgraded@inv.test')?.closure).toEqual(expected);
    expect(closure('ministry', 'member@inv.test')).toBeDefined();
    const archivedRow = revoked.find((r) => r.ministryName === 'Closed choir');
    expect(archivedRow?.closure).toEqual({
      actor: { id: fx.userIds.admin, name: 'admin' },
      at: '2026-10-20T00:00:00.000Z',
      reason: 'ministry-archived',
    });
    // Outstanding offers of an archived Ministry still never list as pending.
    const pending = (await list()).items;
    expect(pending.some((r) => r.ministryName === 'Closed choir')).toBe(false);
  });

  it('never duplicates a row through Roles or deliveries in any status', async () => {
    const id = await ministryOffer({
      ministryId: fx.worshipId,
      inviteeUserId: fx.userIds.worshipLeader,
      roleIds: [fx.singerId, fx.drumsId],
      status: 'accepted',
      acceptedAt: T('2026-10-02T00:00:00.000Z'),
    });
    for (const at of ['2026-11-01T11:00:00.000Z', '2026-11-01T12:00:00.000Z']) {
      await outbox({
        kind: 'invitation.chained',
        payload: { ministryInvitationId: id },
        status: 'sent',
        sentAt: T(at),
        createdAt: T(at),
      });
    }
    signIn('admin');
    const rows = (await list('?status=accepted')).items.filter(
      (r) => r.id === id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roles.map((r) => r.name)).toEqual(['Drums', 'Singer']);
  });
});
