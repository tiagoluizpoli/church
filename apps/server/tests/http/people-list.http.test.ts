import { ministry, ministryMembership, role, volunteer } from '@church/db';
import { parseInstant } from '@church/time';
import { and, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { PeopleController } from '@/api/controllers/people-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbPeopleListManager } from '@/application/db-people-list-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzlePeopleListRepository } from '@/infrastructure/repositories/drizzle-people-list.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildRoleQualification,
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
const CHURCH_A = '91111111-1111-4111-8111-111111111111';
const CHURCH_B = '92222222-2222-4222-8222-222222222222';

let app: FastifyTypedInstance;
let worshipId: string;
let kidsId: string;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const authorityManager = new DbAuthorityManager({
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  // Real manager, repository and AuthorityService; only session and Active Church are seams.
  const controller = new PeopleController({
    peopleListManager: new DbPeopleListManager({
      peopleListRepository: new DrizzlePeopleListRepository({ db }),
      defaultPageSize: 20,
    }),
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

interface PersonInput {
  key: string;
  name?: string;
  church?: string;
  access?: 'admin' | 'member';
  /** Ministry id → level; omit for no Volunteer profile at all. */
  serves?: Record<string, 'leader' | 'volunteer'>;
  endedIn?: string[];
  retiredProfile?: boolean;
}

async function person({
  key,
  name = key,
  church = CHURCH_A,
  access = 'member',
  serves,
  endedIn = [],
  retiredProfile,
}: PersonInput) {
  await buildUser({ db, id: key, name, email: `${key}@people.test` });
  await buildChurchMembership({
    db,
    id: `m-${key}-${church.slice(0, 2)}`,
    churchId: church,
    userId: key,
    accessLevel: access,
  });
  if (!serves && endedIn.length === 0 && !retiredProfile) return;
  const volunteer = await buildVolunteer({
    db,
    churchId: church,
    userId: key,
    leftAt: retiredProfile
      ? parseInstant({ value: '2026-01-01T00:00:00.000Z' })
      : undefined,
  });
  const memberships = [
    ...Object.entries(serves ?? {}).map(([ministryId, level]) => ({
      ministryId,
      level,
      status: 'active' as const,
    })),
    ...endedIn.map((ministryId) => ({
      ministryId,
      level: 'volunteer' as const,
      status: 'inactive' as const,
    })),
  ];
  for (const { ministryId, level, status } of memberships) {
    await buildMinistryMembership({
      db,
      churchId: church,
      volunteerId: volunteer.id,
      ministryId,
      ministryAccessLevel: level,
      status,
      roleIds: [],
    });
  }
}

beforeEach(async () => {
  vi.resetAllMocks();
  await resetSchedulingPhase3Db();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'A',
    slug: 'ppl-a',
    timezone: 'UTC',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'B',
    slug: 'ppl-b',
    timezone: 'UTC',
  });
  worshipId = (await buildMinistry({ db, churchId: CHURCH_A, name: 'Worship' }))
    .id;
  kidsId = (await buildMinistry({ db, churchId: CHURCH_A, name: 'Kids' })).id;
  await buildMinistry({ db, churchId: CHURCH_A, name: 'Ushers' });
  const archived = await buildMinistry({ db, churchId: CHURCH_A, name: 'Old' });
  const bMinistry = await buildMinistry({
    db,
    churchId: CHURCH_B,
    name: 'B Band',
  });
  await person({ key: 'admin', name: 'Ada Admin', access: 'admin' }); // no Volunteer profile
  await person({ key: 'plain', name: 'Pat Plain' });
  await person({
    key: 'wl',
    name: 'Wes Leader',
    serves: { [worshipId]: 'leader' },
  });
  await person({
    key: 'ml',
    name: 'Mia Both',
    serves: { [worshipId]: 'leader', [kidsId]: 'leader' },
  });
  // Leads Worship but only volunteers in Kids: gains no Kids visibility.
  await person({
    key: 'wlkv',
    name: 'Walt Mixed',
    serves: { [worshipId]: 'leader', [kidsId]: 'volunteer' },
  });
  await person({
    key: 'shared',
    name: 'Sam Shared',
    serves: { [worshipId]: 'volunteer', [kidsId]: 'volunteer' },
  });
  await person({
    key: 'kidsvol',
    name: 'Kai Kids',
    serves: { [kidsId]: 'volunteer' },
  });
  await person({ key: 'ended', name: 'Eve Ended', endedIn: [worshipId] });
  await person({ key: 'retired', name: 'Rex Retired', retiredProfile: true });
  await person({
    key: 'archived',
    name: 'Ari Archived',
    serves: { [archived.id]: 'volunteer' },
  });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archived.id));
  // Belongs to both Churches but volunteers only in B.
  await person({ key: 'both', name: 'Bo Both' });
  await person({
    key: 'both',
    name: 'Bo Both',
    church: CHURCH_B,
    serves: { [bMinistry.id]: 'volunteer' },
  }).catch(() => undefined);
});

function signIn(key: string) {
  mockGetSession.mockResolvedValue({
    user: { id: key },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
}

interface Row {
  id: string;
  name: string;
  isAdmin: boolean;
  ministries: { id: string; name: string; ministryAccessLevel: string }[];
}

async function list(query = '') {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/people${query}`,
  });
  const body = res.json();
  return { res, body, items: (body.items ?? []) as Row[] };
}

const names = (items: Row[]) => items.map((i) => i.name);

describe('GET /people', () => {
  it('lets an admin see every member including Ministry-less ones, once each, with current Ministries only', async () => {
    signIn('admin');
    const { res, items, body } = await list();
    expect(res.statusCode).toBe(200);
    expect(names(items)).toEqual([
      'Ada Admin',
      'Ari Archived',
      'Bo Both',
      'Eve Ended',
      'Kai Kids',
      'Mia Both',
      'Pat Plain',
      'Rex Retired',
      'Sam Shared',
      'Walt Mixed',
      'Wes Leader',
    ]);
    expect(items.find((i) => i.name === 'Ada Admin')).toMatchObject({
      isAdmin: true,
      ministries: [],
    });
    expect(items.find((i) => i.name === 'Eve Ended')?.ministries).toEqual([]);
    expect(items.find((i) => i.name === 'Rex Retired')?.ministries).toEqual([]);
    expect(items.find((i) => i.name === 'Ari Archived')?.ministries).toEqual(
      [],
    );
    expect(
      items.find((i) => i.name === 'Mia Both')?.ministries.map((m) => m.name),
    ).toEqual(['Kids', 'Worship']);
    expect(items.find((i) => i.name === 'Bo Both')?.ministries).toEqual([]);
    expect(
      body.options.ministries.map((m: { name: string }) => m.name),
    ).toEqual(['Kids', 'Ushers', 'Worship']);
  });

  it('shows a leader only members of led Ministries, deduplicated, with only led Ministries', async () => {
    signIn('wlkv');
    const { items, body } = await list();
    expect(names(items)).toEqual([
      'Mia Both',
      'Sam Shared',
      'Walt Mixed',
      'Wes Leader',
    ]);
    for (const item of items) {
      expect(item.ministries.map((m) => m.name)).toEqual(['Worship']);
    }
    expect(body.options.ministries).toEqual([
      { id: worshipId, name: 'Worship' },
    ]);
    expect(JSON.stringify(body)).not.toContain('Kids');
  });

  it('shows a two-Ministry leader the union without duplicates', async () => {
    signIn('ml');
    const { items } = await list();
    expect(names(items)).toEqual([
      'Kai Kids',
      'Mia Both',
      'Sam Shared',
      'Walt Mixed',
      'Wes Leader',
    ]);
  });

  it('refuses a volunteer, plain member and anonymous caller', async () => {
    for (const key of ['shared', 'plain']) {
      signIn(key);
      expect((await list()).res.statusCode).toBe(403);
    }
    mockGetSession.mockResolvedValue(null as never);
    expect((await list()).res.statusCode).toBe(401);
  });

  it('searches name and email literally and case-insensitively', async () => {
    signIn('admin');
    expect(names((await list('?search=%20WES%20')).items)).toEqual([
      'Wes Leader',
    ]);
    expect(names((await list('?search=plain@PEOPLE')).items)).toEqual([
      'Pat Plain',
    ]);
    expect((await list('?search=%25')).items).toEqual([]);
    expect((await list('?search=_')).items).toEqual([]);
  });

  it('combines Ministry and Access on the same membership', async () => {
    signIn('admin');
    expect(names((await list(`?ministryId=${worshipId}`)).items)).toEqual([
      'Mia Both',
      'Sam Shared',
      'Walt Mixed',
      'Wes Leader',
    ]);
    expect(
      names((await list(`?ministryId=${kidsId}&access=leader`)).items),
    ).toEqual(['Mia Both']);
    expect(
      names((await list(`?ministryId=${kidsId}&access=volunteer`)).items),
    ).toEqual(['Kai Kids', 'Sam Shared', 'Walt Mixed']);
    expect(names((await list('?access=admin')).items)).toEqual(['Ada Admin']);
    expect(names((await list('?access=leader')).items)).toEqual([
      'Mia Both',
      'Walt Mixed',
      'Wes Leader',
    ]);
    // Admin is Church-wide but still honors the Ministry filter.
    expect((await list(`?access=admin&ministryId=${kidsId}`)).items).toEqual(
      [],
    );
  });

  it('applies a leader filter inside the leader scope', async () => {
    signIn('wl');
    expect(names((await list('?access=volunteer')).items)).toEqual([
      'Sam Shared',
    ]);
    expect((await list('?access=admin')).items).toEqual([]);
  });

  it('pages deterministically across equal names', async () => {
    signIn('admin');
    for (const n of ['a', 'b', 'c']) {
      await person({ key: `twin-${n}`, name: 'Twin Name' });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const { body, res } = await list(
        `?limit=4&search=twin${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(res.statusCode).toBe(200);
      seen.push(...body.items.map((i: Row) => i.id));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['m-twin-a-91', 'm-twin-b-91', 'm-twin-c-91']);
    const first = await list('?limit=2&search=twin');
    expect(first.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeDefined();
    const second = await list(
      `?limit=2&search=twin&cursor=${first.body.nextCursor}`,
    );
    expect(second.items.map((i) => i.id)).toEqual(['m-twin-c-91']);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it('rejects invalid filters, cursors and limits with 422', async () => {
    signIn('admin');
    for (const q of [
      '?access=owner',
      '?cursor=nope',
      '?limit=0',
      '?limit=51',
      '?ministryId=not-a-uuid',
      '?search=',
    ]) {
      const { res, body } = await list(q);
      expect(res.statusCode, q).toBe(422);
      expect(body.error).toBe('VALIDATION_ERROR');
    }
  });

  it('answers out-of-scope, archived, foreign and missing Ministry filters alike', async () => {
    const missing = '99999999-9999-4999-8999-999999999999';
    const bodies: unknown[] = [];
    signIn('wl');
    for (const id of [kidsId, missing]) {
      const { res, body } = await list(`?ministryId=${id}`);
      expect(res.statusCode).toBe(404);
      expect(body.error).toBe('MINISTRY_NOT_FOUND');
      bodies.push(body);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    signIn('admin');
    expect((await list(`?ministryId=${missing}`)).res.statusCode).toBe(404);
  });

  it('keeps Church B data out', async () => {
    signIn('admin');
    const { body } = await list();
    expect(JSON.stringify(body)).not.toContain('B Band');
  });
});

describe('GET /people/{memberId}', () => {
  const member = (key: string, church = CHURCH_A) =>
    `m-${key}-${church.slice(0, 2)}`;
  const get = async (id: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/people/${id}`,
    });
    return { res, body: res.json() };
  };

  beforeEach(async () => {
    const live = await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: worshipId,
      name: 'Singer',
    });
    const old = await buildRole({
      db,
      churchId: CHURCH_A,
      ministryId: worshipId,
      name: 'Drummer',
    });
    await db
      .update(role)
      .set({ archivedAt: new Date() })
      .where(eq(role.id, old.id));
    const [membership] = await db
      .select({ id: ministryMembership.id })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .where(
        and(
          eq(volunteer.userId, 'shared'),
          eq(ministryMembership.ministryId, worshipId),
        ),
      );
    for (const roleId of [live.id, old.id]) {
      await buildRoleQualification({
        db,
        churchId: CHURCH_A,
        ministryMembershipId: membership?.id ?? '',
        roleId,
      });
    }
  });

  it('shows an admin every active card, held Roles with the archived marker, and Church access', async () => {
    signIn('admin');
    const { res, body } = await get(member('shared'));
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({
      id: member('shared'),
      name: 'Sam Shared',
      email: 'shared@people.test',
      canChangeChurchAccess: true,
      canInviteToMinistry: true,
      churchAccess: { accessLevel: 'member', isLastAdmin: false },
    });
    expect(
      body.ministries.map((m: { ministryName: string }) => m.ministryName),
    ).toEqual(['Kids', 'Worship']);
    expect(body.ministries[1].roles).toEqual([
      expect.objectContaining({ name: 'Drummer', archived: true }),
      expect.objectContaining({ name: 'Singer', archived: false }),
    ]);
  });

  it('lets an admin inspect a Ministry-less admin and flags the last admin', async () => {
    signIn('admin');
    const { res, body } = await get(member('admin'));
    expect(res.statusCode).toBe(200);
    expect(body.ministries).toEqual([]);
    expect(body.churchAccess).toEqual({
      accessLevel: 'admin',
      isLastAdmin: true,
    });
  });

  it('omits ended, retired and archived-Ministry memberships', async () => {
    signIn('admin');
    for (const key of ['ended', 'retired', 'archived']) {
      const { res, body } = await get(member(key));
      expect(res.statusCode).toBe(200);
      expect(body.ministries, key).toEqual([]);
    }
  });

  it('shows a leader only led cards, no Church access and no trace of unseen Ministries', async () => {
    signIn('wl');
    const { res, body } = await get(member('shared'));
    expect(res.statusCode).toBe(200);
    expect(body.ministries).toHaveLength(1);
    expect(body.ministries[0].ministryName).toBe('Worship');
    expect(body).not.toHaveProperty('churchAccess');
    expect(body.canChangeChurchAccess).toBe(false);
    expect(JSON.stringify(body)).not.toContain('Kids');
  });

  it('answers missing, cross-Church and out-of-scope ids with the same 404', async () => {
    signIn('wl');
    const bodies = [];
    for (const id of [
      member('kidsvol'),
      member('plain'),
      'nope',
      member('both', CHURCH_B),
    ]) {
      const { res, body } = await get(id);
      expect(res.statusCode, id).toBe(404);
      expect(body.error).toBe('NOT_FOUND');
      bodies.push(body);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    signIn('admin');
    expect((await get(member('both', CHURCH_B))).res.statusCode).toBe(404);
  });

  it('refuses a volunteer, plain member and anonymous caller', async () => {
    for (const key of ['shared', 'plain']) {
      signIn(key);
      expect((await get(member('wl'))).res.statusCode).toBe(403);
    }
    mockGetSession.mockResolvedValue(null as never);
    expect((await get(member('wl'))).res.statusCode).toBe(401);
  });
});
