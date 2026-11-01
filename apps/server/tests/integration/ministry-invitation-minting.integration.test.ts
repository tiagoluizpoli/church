import { appConfig } from '@church/app-config';
import { invitation as churchInvitation, ministryInvitation } from '@church/db';
import {
  addMilliseconds,
  compareInstants,
  fromDate,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from './repositories/setup';
import { ChurchNotifications } from '@/application/church-notifications';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbMinistryInvitationManager } from '@/application/db-ministry-invitation-manager';
import { ChurchId, MinistryId, RoleId, UserId } from '@/domain/branded-ids';
import { InsufficientInvitationAuthorityError } from '@/domain/errors/insufficient-invitation-authority';
import { InvalidInvitationRoleError } from '@/domain/errors/invalid-invitation-role';
import { InviteeAlreadyMinistryMemberError } from '@/domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '@/domain/errors/ministry-invitation-not-found';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import {
  DrizzleEventRepository,
  DrizzleEventTimeBlockRepository,
  DrizzleMinistryInvitationRepository,
  DrizzleMinistryRepository,
  DrizzleOutboxRepository,
  DrizzleRoleRepository,
  DrizzleUnitOfWork,
} from '@/infrastructure/repositories';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';

const ministryInvitationRepository = new DrizzleMinistryInvitationRepository({
  db: testDb,
  config: appConfig,
});
const roleRepository = new DrizzleRoleRepository({ db: testDb });
const ministryRepository = new DrizzleMinistryRepository({ db: testDb });
const authorityManager = new DbAuthorityManager({
  actorRepository: new DrizzleAuthorityActorResolver({ db: testDb }),
  scopeRepository: new DrizzleSchedulingScopeResolver({ db: testDb }),
  eventRepository: new DrizzleEventRepository({ db: testDb }),
  eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db: testDb }),
  ministryRepository: ministryRepository,
});
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const outboxRepository = new DrizzleOutboxRepository({ db: testDb });

const manager = new DbMinistryInvitationManager({
  repo: ministryInvitationRepository,
  roleRepository,
  ministryRepository,
  authorityManager,
  unitOfWork,
  outboxRepository,
  notifications: new ChurchNotifications({ outboxRepository }),
  config: appConfig,
});

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

describe('DbMinistryInvitationManager.mint', () => {
  it('allows a ChurchAdmin to mint at leader access level for any Ministry', async () => {
    const invitation = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryTwoA),
      inviterId: UserId.from(fixture.adminA),
      email: 'outsider-1@fixture.test',
      ministryAccessLevel: 'leader',
      roleIds: [],
    });

    expect(invitation.status).toBe('pending');
    expect(invitation.ministryAccessLevel).toBe('leader');
    expect(invitation.kind).toBe('chained');
  });

  it('allows a Ministry leader to mint at volunteer level for their own Ministry', async () => {
    const invitation = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.leaderOfMinistryOneA),
      email: 'outsider-2@fixture.test',
      ministryAccessLevel: 'volunteer',
      roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
    });

    expect(invitation.ministryAccessLevel).toBe('volunteer');
    expect(invitation.roleIds).toEqual([fixture.roleInMinistryOneA]);
  });

  it('rejects a Ministry leader requesting leader access with INSUFFICIENT_INVITATION_AUTHORITY', async () => {
    await expect(
      manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.leaderOfMinistryOneA),
        email: 'outsider-3@fixture.test',
        ministryAccessLevel: 'leader',
        roleIds: [],
      }),
    ).rejects.toBeInstanceOf(InsufficientInvitationAuthorityError);
  });

  it('produces a byte-identical 404 for a nonexistent Ministry, a cross-Ministry leader, and a cross-Church Ministry', async () => {
    const nonexistentMinistryId = '00000000-0000-4000-8000-000000000000';

    const nonexistent = await manager
      .mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(nonexistentMinistryId),
        inviterId: UserId.from(fixture.adminA),
        email: 'outsider-4@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      })
      .catch((error) => error);

    const crossMinistryLeader = await manager
      .mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryTwoA),
        inviterId: UserId.from(fixture.leaderOfMinistryOneA),
        email: 'outsider-5@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      })
      .catch((error) => error);

    const teamLeaderOnly = await manager
      .mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.teamLeaderA),
        email: 'outsider-6@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      })
      .catch((error) => error);

    const crossChurchMinistry = await manager
      .mint({
        churchId: ChurchId.from(fixture.churchB.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminB),
        email: 'outsider-7@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      })
      .catch((error) => error);

    for (const outcome of [
      nonexistent,
      crossMinistryLeader,
      teamLeaderOnly,
      crossChurchMinistry,
    ]) {
      expect(outcome).toBeInstanceOf(MinistryInvitationNotFoundError);
    }

    const messages = [
      nonexistent,
      crossMinistryLeader,
      teamLeaderOnly,
      crossChurchMinistry,
    ].map((error) => ({ code: error.code, message: error.message }));
    expect(new Set(messages.map((m) => JSON.stringify(m))).size).toBe(1);

    // The other Church's real name never leaks through this failure path.
    expect(JSON.stringify(messages)).not.toContain(fixture.churchB.name);
    expect(JSON.stringify(messages)).not.toContain(fixture.churchA.name);
  });

  it('rejects an invalid Role id with neither half created', async () => {
    await expect(
      manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: 'outsider-8@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [RoleId.from('00000000-0000-4000-8000-000000000000')],
      }),
    ).rejects.toBeInstanceOf(InvalidInvitationRoleError);
  });

  it('addresses an existing Church Member by inviteeUserId rather than chaining', async () => {
    const invitation = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.existingChurchMemberA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    expect(invitation.kind).toBe('ministry-only');
    expect(invitation.inviteeUserId).toBe(fixture.existingChurchMemberA);
  });

  it('rejects an invitee who already holds Ministry Membership in that Ministry', async () => {
    await expect(
      manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.leaderOfMinistryOneA}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      }),
    ).rejects.toBeInstanceOf(InviteeAlreadyMinistryMemberError);
  });

  it('refreshes the existing pending invitation on re-invite rather than duplicating it', async () => {
    const first = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.existingChurchMemberA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const second = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.existingChurchMemberA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    expect(second.id).toBe(first.id);
    expect(
      compareInstants({ left: second.expiresAt, right: first.expiresAt }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('reuses a still-pending chained Church Invitation on re-invite rather than minting a second one', async () => {
    const first = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: 'repeat-outsider@fixture.test',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const second = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: 'repeat-outsider@fixture.test',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    expect(second.id).toBe(first.id);
    expect(second.churchInvitationId).toBe(first.churchInvitationId);
  });

  it('serializes two concurrent re-invites of the same person into one row rather than a constraint violation', async () => {
    const mintSameRecipient = () =>
      manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.existingChurchMemberA}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });

    const [first, second] = await Promise.all([
      mintSameRecipient(),
      mintSameRecipient(),
    ]);

    expect(first.id).toBe(second.id);
  });
});

describe('DbMinistryInvitationManager.resend', () => {
  it('refreshes expiry and returns the same invitation without duplicating it', async () => {
    const minted = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.existingChurchMemberA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const resent = await manager.resend({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      ministryInvitationId: minted.id,
      callerId: UserId.from(fixture.adminA),
    });

    expect(resent.id).toBe(minted.id);
  });

  it('returns the same 404 as mint for an unauthorized caller', async () => {
    const minted = await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.existingChurchMemberA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    await expect(
      manager.resend({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        ministryInvitationId: minted.id,
        callerId: UserId.from(fixture.leaderOfMinistryTwoA),
      }),
    ).rejects.toBeInstanceOf(MinistryInvitationNotFoundError);
  });
});

const DAY_MS = 24 * 60 * 60_000;
const MINTED_AT = parseInstant({ value: '2026-11-01T12:00:00.000Z' });
const RESENT_AT = addMilliseconds({
  instant: MINTED_AT,
  milliseconds: 3 * DAY_MS,
});

interface CreateManagerWithChurchTtlInput {
  churchInvitationTtlMs: number;
}

/** The same composition with an overridden Church Invitation lifetime. */
function createManagerWithChurchTtl({
  churchInvitationTtlMs,
}: CreateManagerWithChurchTtlInput): DbMinistryInvitationManager {
  const config = {
    ...appConfig,
    churchInvitation: { ttlMs: churchInvitationTtlMs },
  };
  return new DbMinistryInvitationManager({
    repo: new DrizzleMinistryInvitationRepository({ db: testDb, config }),
    roleRepository,
    ministryRepository,
    authorityManager,
    unitOfWork,
    outboxRepository,
    notifications: new ChurchNotifications({ outboxRepository }),
    config,
  });
}

interface PairExpiriesInput {
  ministryInvitationId: string;
}

async function pairExpiries({ ministryInvitationId }: PairExpiriesInput) {
  const [row] = await testDb
    .select({
      ministry: ministryInvitation.expiresAt,
      church: churchInvitation.expiresAt,
    })
    .from(ministryInvitation)
    .innerJoin(
      churchInvitation,
      eq(churchInvitation.id, ministryInvitation.churchInvitationId),
    )
    .where(eq(ministryInvitation.id, ministryInvitationId));
  if (!row) throw new Error('Expected a paired invitation.');
  return {
    ministry: fromDate({ date: row.ministry }),
    church: fromDate({ date: row.church }),
  };
}

describe('paired Church Invitation expiry', () => {
  afterEach(() => resetClock());

  it.each([
    { label: 'the central 7-day policy', ttlMs: 7 * DAY_MS },
    { label: 'an overridden policy', ttlMs: 2 * DAY_MS },
  ])('issues and resends both halves on $label', async ({ ttlMs }) => {
    const pairedManager = createManagerWithChurchTtl({
      churchInvitationTtlMs: ttlMs,
    });
    setTestClock({ instant: MINTED_AT });
    const minted = await pairedManager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: 'paired-expiry@fixture.test',
      ministryAccessLevel: 'volunteer',
      roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
    });
    const mintedExpiry = addMilliseconds({
      instant: MINTED_AT,
      milliseconds: ttlMs,
    });
    expect(await pairExpiries({ ministryInvitationId: minted.id })).toEqual({
      ministry: mintedExpiry,
      church: mintedExpiry,
    });

    setTestClock({ instant: RESENT_AT });
    await pairedManager.resend({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      ministryInvitationId: minted.id,
      callerId: UserId.from(fixture.adminA),
    });

    const resentExpiry = addMilliseconds({
      instant: RESENT_AT,
      milliseconds: ttlMs,
    });
    expect(await pairExpiries({ ministryInvitationId: minted.id })).toEqual({
      ministry: resentExpiry,
      church: resentExpiry,
    });
  });
});
