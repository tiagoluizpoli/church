import { randomUUID } from 'node:crypto';
import {
  invitation as churchInvitation,
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
  // Real manager, repository and AuthorityService; only session and Active Church are seams.
  const controller = new InvitationController({
    invitationListManager: new DbInvitationListManager({
      invitationListRepository: new DrizzleInvitationListRepository({ db }),
      defaultPageSize: 20,
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: new DrizzleAuthorityActorResolver({ db }),
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository,
      }),
    }),
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
  email: string;
  churchAccessLevel?: string;
  ministryAccessLevel?: string;
  roles: { name: string }[];
  displayStatus: string;
  status: string;
  emailDelivery: { state: string; sentAt?: string };
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
  status?: 'pending' | 'accepted';
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
