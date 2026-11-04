import { appConfig } from '@church/app-config';
import * as schema from '@church/db';
import {
  invitation as churchInvitation,
  ministryInvitation,
  ministryMembership,
  session,
  user,
  volunteer,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { env } from '@church/env/server';
import { makeSignature } from 'better-auth/crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DbRedemptionManager } from '@/application/db-redemption-manager';
import { InvitationVerificationCodeManager } from '@/application/invitation-verification-code-manager';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '@/domain/branded-ids';
import { InvitationNotPendingError } from '@/domain/errors/invitation-not-pending';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleSecurityLogRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
} from '@/infrastructure/repositories';
import { BetterAuthRedemptionIdentityGateway } from '@/infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { auth, createServerAuth } from '@/main/di/server-auth';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

/**
 * Real redemption (Better Auth included) racing real management revokes.
 * Each race parks one side at a repository call while it holds its locks,
 * so the interleaving is deterministic rather than left to timing.
 */
const INVITEE_EMAIL = 'racer@invitee.test';

// Two parked transactions plus the reads around them outgrow the shared pool.
const racePool = new pg.Pool({
  connectionString: getIntegrationDatabaseUrl(),
  max: 6,
});
const raceDb = drizzle(racePool, { schema });
afterAll(() => racePool.end());

const redemptionRepository = new DrizzleRedemptionRepository({
  db: raceDb,
  volunteerRepository: new DrizzleVolunteerRepository({ db: raceDb }),
});
const harness = createMinistryInvitationTestHarness({ db: raceDb });
const { manager: invitationManager, ministryInvitationRepository } = harness;
const redemptionManager = new DbRedemptionManager({
  churchRepository: harness.churchRepository,
  identityGateway: new BetterAuthRedemptionIdentityGateway({
    auth,
    createTransactionAuth: createServerAuth,
  }),
  invitationRepository: ministryInvitationRepository,
  invitationVerificationCodeManager: new InvitationVerificationCodeManager({
    repository: new DrizzleInvitationVerificationCodeRepository({
      db: raceDb,
      config: appConfig,
    }),
    emailSender: new CaptureEmailSender('Church'),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
    config: appConfig,
  }),
  redemptionRepository,
  securityLogRepository: new DrizzleSecurityLogRepository({ db: raceDb }),
  unitOfWork: new DrizzleUnitOfWork({ db: raceDb }),
  failureLog: { record: () => {} },
});

let fixture: TwoChurchIdentityFixture;
let churchId: ChurchId;
let adminId: UserId;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  churchId = ChurchId.from(fixture.churchA.id);
  adminId = UserId.from(fixture.adminA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Invitee {
  userId: UserId;
  sessionCookie: string;
}

/** The invited address signs up outside the offer, so it redeems as an existing User. */
async function signedInInvitee(): Promise<Invitee> {
  const userId = crypto.randomUUID();
  await testDb.insert(user).values({
    id: userId,
    name: 'Racer',
    email: INVITEE_EMAIL,
    emailVerified: true,
  });
  const token = crypto.randomUUID();
  await testDb.insert(session).values({
    id: crypto.randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const signature = await makeSignature(token, env.BETTER_AUTH_SECRET);
  return {
    userId: UserId.from(userId),
    sessionCookie: `better-auth.session_token=${token}.${signature}`,
  };
}

/** Worship (volunteer, one Role) and, optionally, Ministry Two (leader) halves of one Church Invitation. */
async function sharedOffer({ halves }: { halves: 1 | 2 }) {
  const worship = await invitationManager.mint({
    churchId,
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: adminId,
    email: INVITEE_EMAIL,
    ministryAccessLevel: 'volunteer',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
  const second =
    halves === 2
      ? await invitationManager.mint({
          churchId,
          ministryId: MinistryId.from(fixture.ministryTwoA),
          inviterId: adminId,
          email: INVITEE_EMAIL,
          ministryAccessLevel: 'leader',
          roleIds: [],
        })
      : undefined;
  return {
    churchInvitationId: worship.churchInvitationId as string,
    worshipId: MinistryInvitationId.from(worship.id),
    secondId: second ? MinistryInvitationId.from(second.id) : undefined,
  };
}

/** A promise the test resolves to let a parked transaction continue. */
function gate() {
  const entered = Promise.withResolvers<void>();
  const open = Promise.withResolvers<void>();
  return {
    entered: entered.promise,
    open: () => open.resolve(),
    async park() {
      entered.resolve();
      await open.promise;
    },
  };
}

/** Waits for a parked side, failing fast if `work` settles without parking. */
async function parked(input: { gate: Promise<void>; work: Promise<unknown> }) {
  const settled = input.work.then(
    (value) => {
      throw new Error(`Settled before parking: ${JSON.stringify(value)}`);
    },
    (error: unknown) => {
      throw new Error(`Failed before parking: ${String(error)}`);
    },
  );
  await Promise.race([input.gate, settled]);
}

/**
 * Resolves once a connection is queued behind a lock held by a parked
 * transaction (idle in transaction), so an unrelated lock wait cannot release
 * the race early.
 */
async function untilLockWait() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await raceDb.execute(
      sql`SELECT count(*)::int AS waiting
        FROM pg_stat_activity waiter
        JOIN pg_stat_activity holder ON holder.pid = ANY(pg_blocking_pids(waiter.pid))
        WHERE waiter.datname = current_database()
          AND waiter.wait_event_type = 'Lock'
          AND holder.datname = current_database()
          AND holder.state = 'idle in transaction'`,
    );
    if ((rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('No connection ever waited on a parked transaction');
}

async function churchRow(id: string) {
  const [row] = await testDb
    .select()
    .from(churchInvitation)
    .where(eq(churchInvitation.id, id));
  return row;
}

async function ministryRow(id: string) {
  const [row] = await testDb
    .select()
    .from(ministryInvitation)
    .where(eq(ministryInvitation.id, id));
  return row;
}

async function membershipMinistries(userId: UserId) {
  const rows = await testDb
    .select({ ministryId: ministryMembership.ministryId })
    .from(ministryMembership)
    .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
    .where(eq(volunteer.userId, userId));
  return rows.map(({ ministryId }) => ministryId);
}

const manualBy = (actorId: string) => ({
  status: 'canceled',
  canceledById: actorId,
  cancelReason: 'manual',
});

describe('acceptance versus Ministry revoke', () => {
  it('serializes accepting one half against revoking its sibling after Church admission: no deadlock, the revoked sibling is not granted', async () => {
    const offer = await sharedOffer({ halves: 2 });
    const secondId = offer.secondId as MinistryInvitationId;
    const invitee = await signedInInvitee();
    // Acceptance parks after reading its siblings, Church admission committed.
    const siblingsRead = gate();
    const findSiblings =
      ministryInvitationRepository.findPendingSiblingMinistryInvitationIds.bind(
        ministryInvitationRepository,
      );
    vi.spyOn(
      ministryInvitationRepository,
      'findPendingSiblingMinistryInvitationIds',
    ).mockImplementationOnce(async (input) => {
      const ids = await findSiblings(input);
      await siblingsRead.park();
      return ids;
    });
    // The revoke parks holding the Church row and its canceled target half.
    const targetCanceled = gate();
    const lockHalves = ministryInvitationRepository.lockPendingHalves.bind(
      ministryInvitationRepository,
    );
    vi.spyOn(
      ministryInvitationRepository,
      'lockPendingHalves',
    ).mockImplementationOnce(async (input) => {
      await targetCanceled.park();
      return lockHalves(input);
    });

    const accepting = redemptionManager.acceptExistingMember({
      ministryInvitationId: offer.worshipId,
      userId: invitee.userId,
      sessionCookie: invitee.sessionCookie,
      idempotencyKey: crypto.randomUUID(),
    });
    await parked({ gate: siblingsRead.entered, work: accepting });
    const revoking = invitationManager.revoke({
      churchId,
      ministryId: MinistryId.from(fixture.ministryTwoA),
      ministryInvitationId: secondId,
      callerId: adminId,
    });
    await parked({ gate: targetCanceled.entered, work: revoking });
    siblingsRead.open();
    await untilLockWait();
    targetCanceled.open();

    await expect(revoking).resolves.toBeUndefined();
    await expect(accepting).resolves.toMatchObject({ kind: 'full-success' });
    expect(await ministryRow(offer.worshipId)).toMatchObject({
      status: 'accepted',
    });
    expect(await ministryRow(secondId)).toMatchObject(manualBy(adminId));
    expect((await churchRow(offer.churchInvitationId))?.status).toBe(
      'accepted',
    );
    expect(await membershipMinistries(invitee.userId)).toEqual([
      fixture.ministryOneA,
    ]);
  });
});

describe('decline versus Ministry revoke', () => {
  it('never overwrites a Church revocation that commits while the decline waits', async () => {
    const offer = await sharedOffer({ halves: 1 });
    const invitee = await signedInInvitee();
    // The last-half revoke parks after closing the Church Invitation, uncommitted.
    const parentCanceled = gate();
    const cancelChurch =
      ministryInvitationRepository.cancelChurchInvitation.bind(
        ministryInvitationRepository,
      );
    vi.spyOn(
      ministryInvitationRepository,
      'cancelChurchInvitation',
    ).mockImplementationOnce(async (input) => {
      const canceled = await cancelChurch(input);
      await parentCanceled.park();
      return canceled;
    });

    const revoking = invitationManager.revoke({
      churchId,
      ministryId: MinistryId.from(fixture.ministryOneA),
      ministryInvitationId: offer.worshipId,
      callerId: adminId,
    });
    await parked({ gate: parentCanceled.entered, work: revoking });
    const declining = redemptionManager.declineInvitation({
      ministryInvitationId: offer.worshipId,
      userId: invitee.userId,
      sessionCookie: invitee.sessionCookie,
    });
    await untilLockWait();
    parentCanceled.open();

    await expect(revoking).resolves.toBeUndefined();
    await expect(declining).resolves.toEqual({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });
    expect(await churchRow(offer.churchInvitationId)).toMatchObject(
      manualBy(adminId),
    );
    expect(await ministryRow(offer.worshipId)).toMatchObject(manualBy(adminId));
  });
});

describe('acceptance versus Church revoke', () => {
  it('refuses a Church revoke that waits on an acceptance, keeping the accepted offer and its grants', async () => {
    const offer = await sharedOffer({ halves: 1 });
    await invitationManager.mintAdmin({
      churchId,
      inviterId: adminId,
      email: INVITEE_EMAIL,
    });
    const invitee = await signedInInvitee();
    // Acceptance parks holding the Church row it has just accepted.
    const churchAccepted = gate();
    const recordAcceptance =
      redemptionRepository.recordChurchInvitationAcceptance.bind(
        redemptionRepository,
      );
    vi.spyOn(
      redemptionRepository,
      'recordChurchInvitationAcceptance',
    ).mockImplementationOnce(async (input) => {
      await recordAcceptance(input);
      await churchAccepted.park();
    });

    const accepting = redemptionManager.acceptExistingMember({
      ministryInvitationId: offer.worshipId,
      userId: invitee.userId,
      sessionCookie: invitee.sessionCookie,
      idempotencyKey: crypto.randomUUID(),
    });
    await parked({ gate: churchAccepted.entered, work: accepting });
    const revoking = invitationManager.revokeChurch({
      churchId,
      churchInvitationId: offer.churchInvitationId,
      callerId: adminId,
    });
    await untilLockWait();
    churchAccepted.open();

    await expect(revoking).rejects.toBeInstanceOf(InvitationNotPendingError);
    await expect(accepting).resolves.toMatchObject({ kind: 'full-success' });
    const untouched = {
      canceledAt: null,
      canceledById: null,
      cancelReason: null,
    };
    expect(await churchRow(offer.churchInvitationId)).toMatchObject({
      status: 'accepted',
      role: 'admin',
      ...untouched,
    });
    expect(await ministryRow(offer.worshipId)).toMatchObject({
      status: 'accepted',
      ...untouched,
    });
    expect(await membershipMinistries(invitee.userId)).toEqual([
      fixture.ministryOneA,
    ]);
  });
});
