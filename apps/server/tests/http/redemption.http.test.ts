import { appConfig } from '@church/app-config';
import {
  account,
  invitation as churchInvitation,
  member,
  ministryInvitation,
  ministryMembership,
  ministryMembershipRole,
  outboxMessage,
  session,
  user,
  volunteer,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedemptionController } from '@/api/controllers/redemption-controller';
import { DbRedemptionManager } from '@/application/db-redemption-manager';
import { DbVolunteerTransferManager } from '@/application/db-volunteer-transfer-manager';
import { InvitationVerificationCodeManager } from '@/application/invitation-verification-code-manager';
import {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  type VolunteerId,
} from '@/domain/branded-ids';
import type {
  AcceptMinistryInvitationInput,
  DeclineMinistryInvitationInput,
  RecordChurchOnlyPartialAcceptanceInput,
  RedemptionRepository,
} from '@/domain/contracts/infrastructure/redemption.repository';
import type {
  RedemptionFailureEntry,
  RedemptionFailureLog,
} from '@/domain/contracts/infrastructure/redemption-failure-log';
import type {
  AcceptChurchInvitationInput,
  CreateRedemptionAccountInput,
  CreateRedemptionAccountOutput,
} from '@/domain/contracts/infrastructure/redemption-identity-gateway';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleSecurityLogRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
  DrizzleVolunteerTransferRepository,
} from '@/infrastructure/repositories';
import { BetterAuthRedemptionIdentityGateway } from '@/infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { auth, createServerAuth } from '@/main/di/server-auth';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { provisionChurch } from '@/scripts/provision-church';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

type IdentityFault = 'after-account' | 'after-church-admission';

/** The real Better Auth gateway, with failures injected after its writes. */
class FaultInjectingIdentityGateway extends BetterAuthRedemptionIdentityGateway {
  failNext: IdentityFault | undefined;
  /** Runs before sign-up: lets a test commit a racing User first. */
  beforeAccount: (() => Promise<void>) | undefined;

  constructor() {
    super({ auth, createTransactionAuth: createServerAuth });
  }

  async createAccount(
    input: CreateRedemptionAccountInput,
  ): Promise<CreateRedemptionAccountOutput> {
    await this.beforeAccount?.();
    const account = await super.createAccount(input);
    this.trip({ fault: 'after-account' });
    return account;
  }

  async acceptChurchInvitation(
    input: AcceptChurchInvitationInput,
  ): Promise<void> {
    await super.acceptChurchInvitation(input);
    this.trip({ fault: 'after-church-admission' });
  }

  private trip({ fault }: TripInput): void {
    if (this.failNext !== fault) return;
    this.failNext = undefined;
    throw new Error(`Injected identity failure ${fault}.`);
  }
}

interface TripInput {
  fault: IdentityFault;
}

class RecordingFailureLog implements RedemptionFailureLog {
  entries: RedemptionFailureEntry[] = [];

  record(entry: RedemptionFailureEntry): void {
    this.entries.push(entry);
  }
}

class FailOnceAfterCheckpointThreeRepository implements RedemptionRepository {
  failNextAcceptance = true;

  constructor({ delegate }: FailOnceAfterCheckpointThreeRepositoryInput) {
    this.delegate = delegate;
  }

  private readonly delegate: RedemptionRepository;

  async acceptPendingMinistryInvitation(
    input: AcceptMinistryInvitationInput,
  ): Promise<VolunteerId> {
    const volunteerId =
      await this.delegate.acceptPendingMinistryInvitation(input);
    if (this.failNextAcceptance) {
      this.failNextAcceptance = false;
      throw new Error('Forced checkpoint-three failure.');
    }
    return volunteerId;
  }

  async declineMinistryInvitation(
    input: DeclineMinistryInvitationInput,
  ): Promise<void> {
    return this.delegate.declineMinistryInvitation(input);
  }

  async recordChurchOnlyPartialAcceptance(
    input: RecordChurchOnlyPartialAcceptanceInput,
  ): Promise<void> {
    return this.delegate.recordChurchOnlyPartialAcceptance(input);
  }
}

interface RedemptionHttpHarness {
  app: FastifyTypedInstance;
  identityGateway: FaultInjectingIdentityGateway;
  failureLog: RecordingFailureLog;
}

interface FailOnceAfterCheckpointThreeRepositoryInput {
  delegate: RedemptionRepository;
}

interface CreateHarnessInput {
  redemptionRepository?: RedemptionRepository;
}

interface RedemptionUrlInput {
  invitationId: string;
}

const verificationCodeRepository =
  new DrizzleInvitationVerificationCodeRepository({
    db: testDb,
    config: appConfig,
  });
const volunteerRepository = new DrizzleVolunteerRepository({ db: testDb });
const drizzleRedemptionRepository = new DrizzleRedemptionRepository({
  db: testDb,
  volunteerRepository,
});
const volunteerTransferRepository = new DrizzleVolunteerTransferRepository({
  db: testDb,
});
const securityLogRepository = new DrizzleSecurityLogRepository({
  db: testDb,
});
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const {
  manager: invitationManager,
  ministryInvitationRepository,
  churchRepository,
  notifications,
} = createMinistryInvitationTestHarness({ db: testDb });

/** Users and Volunteers `seedTwoChurchIdentityFixture` creates. */
const FIXTURE_USER_COUNT = 8;
let fixtureVolunteerCount = 0;
let app: FastifyTypedInstance | undefined;
let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  fixtureVolunteerCount = (await testDb.select().from(volunteer)).length;
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function createHarness({
  redemptionRepository = drizzleRedemptionRepository,
}: CreateHarnessInput = {}): Promise<RedemptionHttpHarness> {
  const identityGateway = new FaultInjectingIdentityGateway();
  const failureLog = new RecordingFailureLog();
  const verificationCodeManager = new InvitationVerificationCodeManager({
    repository: verificationCodeRepository,
    emailSender: new CaptureEmailSender('Church'),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
    config: appConfig,
  });
  const redemptionManager = new DbRedemptionManager({
    churchRepository,
    identityGateway,
    invitationRepository: ministryInvitationRepository,
    invitationVerificationCodeManager: verificationCodeManager,
    redemptionRepository,
    securityLogRepository,
    unitOfWork,
    failureLog,
  });
  const volunteerTransferManager = new DbVolunteerTransferManager({
    churchRepository,
    identityGateway,
    invitationRepository: ministryInvitationRepository,
    notifications,
    securityLogRepository,
    unitOfWork,
    volunteerRepository,
    volunteerTransferRepository,
  });
  app = await createFastify({ locale: testLocale });
  const controller = new RedemptionController({
    redemptionManager,
    volunteerTransferManager,
    config: appConfig,
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
  return { app, identityGateway, failureLog };
}

/** A paired invitation: links and every public operation use its Church half. */
async function mintInvitation(): Promise<InvitationRef> {
  const minted = await invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `redemption-${fixture.churchA.slug}@fixture.test`,
    ministryAccessLevel: 'leader',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
  if (!minted.churchInvitationId)
    throw new Error('Expected a paired invitation.');
  return { id: minted.id, churchInvitationId: minted.churchInvitationId };
}

function redemptionUrl({ invitationId }: RedemptionUrlInput): string {
  return `/api/v1/redemption/church/${invitationId}`;
}

describe('Church invitation redemption HTTP boundary', () => {
  it('returns only the public preview fields for a valid chained invitation', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();

    const response = await app.inject({
      method: 'GET',
      url: redemptionUrl({ invitationId: invitation.churchInvitationId }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: `redemption-${fixture.churchA.slug}@fixture.test`,
      churchName: fixture.churchA.name,
      churchAccessLevel: 'member',
      expiresAt: expect.any(String),
      ministry: {
        invitationId: invitation.id,
        name: expect.stringMatching(/^Worship /),
        ministryAccessLevel: 'leader',
        roleNames: [expect.stringMatching(/^Vocalist /)],
      },
    });
  });

  it('uses the identical unavailable response for missing, expired, canceled, rejected, and accepted invitations', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    const unavailableBodies = [
      (
        await app.inject({
          method: 'GET',
          url: redemptionUrl({
            invitationId: '00000000-0000-4000-8000-000000000000',
          }),
        })
      ).body,
    ];

    for (const state of [
      'expired',
      'canceled',
      'rejected',
      'accepted',
    ] as const) {
      await testDb
        .update(churchInvitation)
        .set(
          state === 'expired'
            ? { expiresAt: new Date('2000-01-01T00:00:00.000Z') }
            : { status: state },
        )
        .where(eq(churchInvitation.id, invitation.churchInvitationId));
      const response = await app.inject({
        method: 'GET',
        url: redemptionUrl({ invitationId: invitation.churchInvitationId }),
      });
      expect(response.statusCode).toBe(404);
      unavailableBodies.push(response.body);
      if (state === 'expired') {
        await testDb
          .update(churchInvitation)
          .set({ expiresAt: new Date(Date.now() + 60 * 60_000) })
          .where(eq(churchInvitation.id, invitation.churchInvitationId));
      }
    }

    expect(unavailableBodies).toEqual([
      '{"error":"INVITATION_UNAVAILABLE","message":"Este convite não está disponível."}',
      '{"error":"INVITATION_UNAVAILABLE","message":"Este convite não está disponível."}',
      '{"error":"INVITATION_UNAVAILABLE","message":"Este convite não está disponível."}',
      '{"error":"INVITATION_UNAVAILABLE","message":"Este convite não está disponível."}',
      '{"error":"INVITATION_UNAVAILABLE","message":"Este convite não está disponível."}',
    ]);
  });

  it('verifies the code before creating identity state and returns a terminal verification failure', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();

    const response = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/redeem`,
      payload: {
        name: 'Verification Failure',
        password: 'correct horse battery staple',
        code: '000000',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });
    const users = await testDb.select().from(user);
    expect(users).toHaveLength(FIXTURE_USER_COUNT);
  });

  it('redeems through Fastify, persists every checkpoint, and returns the authenticated cookie', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    const codeResponse = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/code`,
    });
    expect(codeResponse.statusCode).toBe(200);

    const idempotencyKey = '22222222-2222-4222-8222-222222222222';
    const response = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/redeem`,
      payload: {
        name: 'Redeemed HTTP User',
        password: 'correct horse battery staple',
        code: '123456',
        idempotencyKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ kind: 'full-success' });
    expect(response.headers['set-cookie']).toContain('session_token=');
    const email = `redemption-${fixture.churchA.slug}@fixture.test`;
    const [redeemedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.email, email));
    expect(redeemedUser).toBeDefined();
    if (!redeemedUser) throw new Error('Expected redeemed user.');
    const [churchMembership] = await testDb
      .select()
      .from(member)
      .where(
        and(
          eq(member.organizationId, fixture.churchA.id),
          eq(member.userId, redeemedUser.id),
        ),
      );
    expect(churchMembership).toBeDefined();
    const [activeSession] = await testDb
      .select()
      .from(session)
      .where(eq(session.userId, redeemedUser.id));
    expect(activeSession?.activeOrganizationId).toBe(fixture.churchA.id);
    const [createdVolunteer] = await testDb
      .select()
      .from(volunteer)
      .where(eq(volunteer.userId, redeemedUser.id));
    expect(createdVolunteer).toBeDefined();
    if (!createdVolunteer) throw new Error('Expected redeemed volunteer.');
    expect(response.json()).toEqual({
      kind: 'full-success',
      volunteerId: createdVolunteer.id,
    });
    const [membership] = await testDb
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.volunteerId, createdVolunteer.id));
    expect(membership?.ministryId).toBe(fixture.ministryOneA);
    expect(membership?.ministryAccessLevel).toBe('leader');
    if (!membership) throw new Error('Expected redeemed ministry membership.');
    const grants = await testDb
      .select()
      .from(ministryMembershipRole)
      .where(eq(ministryMembershipRole.ministryMembershipId, membership.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.roleId).toBe(fixture.roleInMinistryOneA);
    const [acceptedMinistryInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    expect(acceptedMinistryInvitation?.status).toBe('accepted');
    expect(
      await testDb
        .select()
        .from(outboxMessage)
        .where(eq(outboxMessage.correlationId, idempotencyKey)),
    ).toHaveLength(0);
  });

  it('serializes duplicate submissions so only the request that consumes the code creates grants', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/code`,
    });
    const basePayload = {
      name: 'Concurrent HTTP User',
      password: 'correct horse battery staple',
      code: '123456',
    };

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/redeem`,
        payload: {
          ...basePayload,
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
        },
      }),
      app.inject({
        method: 'POST',
        url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/redeem`,
        payload: {
          ...basePayload,
          idempotencyKey: '55555555-5555-4555-8555-555555555555',
        },
      }),
    ]);

    const outcomes = responses.map((response) => response.json());
    expect(
      outcomes.filter((outcome) => outcome.kind === 'full-success'),
    ).toHaveLength(1);
    expect(
      outcomes.filter(
        (outcome) =>
          outcome.kind === 'terminal-failure' &&
          outcome.reason === 'VERIFICATION_FAILED',
      ),
    ).toHaveLength(1);
    const email = `redemption-${fixture.churchA.slug}@fixture.test`;
    const [redeemedUser] = await testDb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (!redeemedUser) throw new Error('Expected one redeemed user.');
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, redeemedUser.id)),
    ).toHaveLength(1);
  });

  it.each([
    {
      fault: 'after-account',
      reason: 'IDENTITY_FAILED',
    },
    {
      fault: 'after-church-admission',
      reason: 'IDENTITY_FAILED',
    },
    {
      fault: 'after-ministry-grant',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    },
  ] as const)('rolls back every new-person write on a failure $fault and lets the same invitation retry', async ({
    fault,
    reason,
  }) => {
    const invitation = await mintInvitation();
    const failingRepository = new FailOnceAfterCheckpointThreeRepository({
      delegate: drizzleRedemptionRepository,
    });
    failingRepository.failNextAcceptance = fault === 'after-ministry-grant';
    const { app, identityGateway, failureLog } = await createHarness({
      redemptionRepository: failingRepository,
    });
    if (fault !== 'after-ministry-grant') identityGateway.failNext = fault;
    await requestCode({ invitationId: invitation.churchInvitationId });
    const idempotencyKey = '33333333-3333-4333-8333-333333333333';
    const payload = {
      name: 'Retry HTTP User',
      password: 'correct horse battery staple',
      code: '123456',
      idempotencyKey,
    };

    const firstResponse = await redeem({ app, invitation, payload });

    expect(firstResponse.json()).toEqual({
      kind: 'retryable-failure',
      reason,
    });
    expect(firstResponse.headers['set-cookie']).toBeUndefined();
    expect(await testDb.select().from(user)).toHaveLength(FIXTURE_USER_COUNT);
    expect(
      await testDb
        .select()
        .from(account)
        .where(eq(account.providerId, 'credential')),
    ).toHaveLength(0);
    expect(await testDb.select().from(session)).toHaveLength(0);
    expect(await testDb.select().from(volunteer)).toHaveLength(
      fixtureVolunteerCount,
    );
    expect(await invitationStatuses({ invitation })).toEqual({
      church: 'pending',
      ministry: 'pending',
    });
    expect(failureLog.entries).toEqual([
      {
        reason,
        churchInvitationId: invitation.churchInvitationId,
        ministryInvitationId: invitation.id,
        correlationId: idempotencyKey,
        errorName: 'Error',
      },
    ]);
    expect(JSON.stringify(failureLog.entries)).not.toMatch(
      /correct horse|123456|session_token/,
    );

    const retryResponse = await redeem({
      app,
      invitation,
      payload: { ...payload, name: 'Corrected Retry User' },
    });
    expect(retryResponse.json()).toMatchObject({ kind: 'full-success' });
    expect(retryResponse.headers['set-cookie']).toContain('session_token=');
    expect(await invitationStatuses({ invitation })).toEqual({
      church: 'accepted',
      ministry: 'accepted',
    });
    const redeemedUser = await findInvitedUser();
    expect(redeemedUser.name).toBe('Corrected Retry User');
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, redeemedUser.id)),
    ).toHaveLength(1);
  });

  it('refuses a verified recipient who already has a login, leaving that User untouched', async () => {
    const invitation = await mintInvitation();
    const existing = await buildUser({
      db: testDb,
      id: crypto.randomUUID(),
      name: 'Already Registered',
      email: invitedEmail(),
    });
    const { app } = await createHarness();
    await requestCode({ invitationId: invitation.churchInvitationId });

    const response = await redeem({
      app,
      invitation,
      payload: {
        name: 'Someone Else',
        password: 'correct horse battery staple',
        code: '123456',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    });

    expect(response.json()).toEqual({
      kind: 'terminal-failure',
      reason: 'EMAIL_ALREADY_REGISTERED',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await findInvitedUser()).toEqual(existing);
    expect(await testDb.select().from(session)).toHaveLength(0);
    expect(
      await testDb.select().from(member).where(eq(member.userId, existing.id)),
    ).toHaveLength(0);
    expect(await invitationStatuses({ invitation })).toEqual({
      church: 'pending',
      ministry: 'pending',
    });
  });

  it('preserves a User that a concurrent signup commits mid-join', async () => {
    const invitation = await mintInvitation();
    const { app, identityGateway } = await createHarness();
    const racingUserId = crypto.randomUUID();
    identityGateway.beforeAccount = async () => {
      identityGateway.beforeAccount = undefined;
      await buildUser({
        db: testDb,
        id: racingUserId,
        name: 'Racing Signup',
        email: invitedEmail(),
      });
    };
    await requestCode({ invitationId: invitation.churchInvitationId });

    const response = await redeem({
      app,
      invitation,
      payload: {
        name: 'Second Signup',
        password: 'correct horse battery staple',
        code: '123456',
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      },
    });

    expect(response.json()).toEqual({
      kind: 'terminal-failure',
      reason: 'EMAIL_ALREADY_REGISTERED',
    });
    const preserved = await findInvitedUser();
    expect(preserved).toMatchObject({
      id: racingUserId,
      name: 'Racing Signup',
    });
  });

  it.each([
    99, 100, 101,
  ])('admits a new person into a Church that already has %i Church Members', async (memberCount) => {
    await seedChurchMembers({ total: memberCount });
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    await requestCode({ invitationId: invitation.churchInvitationId });

    const response = await redeem({
      app,
      invitation,
      payload: {
        name: 'Large Church Joiner',
        password: 'correct horse battery staple',
        code: '123456',
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
      },
    });

    expect(response.json()).toMatchObject({ kind: 'full-success' });
    expect(
      await testDb
        .select()
        .from(member)
        .where(eq(member.organizationId, fixture.churchA.id)),
    ).toHaveLength(memberCount + 1);
  });
});

interface RedeemInput {
  app: FastifyTypedInstance;
  invitation: InvitationRef;
  payload: Record<string, string>;
}

interface InvitationRef {
  id: string;
  churchInvitationId: string;
}

interface RequestCodeInput {
  invitationId: string;
}

interface InvitationStatusesInput {
  invitation: InvitationRef;
}

interface InvitationStatuses {
  church: string | undefined;
  ministry: string | undefined;
}

interface SeedChurchMembersInput {
  total: number;
  churchId?: string;
}

async function redeem({ app, invitation, payload }: RedeemInput) {
  return app.inject({
    method: 'POST',
    url: `${redemptionUrl({ invitationId: invitation.churchInvitationId })}/redeem`,
    payload,
  });
}

async function requestCode({ invitationId }: RequestCodeInput): Promise<void> {
  const response = await app?.inject({
    method: 'POST',
    url: `${redemptionUrl({ invitationId })}/code`,
  });
  expect(response?.statusCode).toBe(200);
}

function invitedEmail(): string {
  return `redemption-${fixture.churchA.slug}@fixture.test`;
}

async function findInvitedUser() {
  const [found] = await testDb
    .select()
    .from(user)
    .where(eq(user.email, invitedEmail()));
  if (!found) throw new Error('Expected the invited User.');
  return found;
}

async function invitationStatuses({
  invitation,
}: InvitationStatusesInput): Promise<InvitationStatuses> {
  const [ministry] = await testDb
    .select({
      status: ministryInvitation.status,
      churchInvitationId: ministryInvitation.churchInvitationId,
    })
    .from(ministryInvitation)
    .where(eq(ministryInvitation.id, invitation.id));
  const churchInvitationId = ministry?.churchInvitationId ?? '';
  const [church] = await testDb
    .select({ status: churchInvitation.status })
    .from(churchInvitation)
    .where(eq(churchInvitation.id, churchInvitationId));
  return { church: church?.status, ministry: ministry?.status };
}

/** Tops Church A up to `total` Church Members with shared builders. */
async function seedChurchMembers({
  total,
  churchId = fixture.churchA.id,
}: SeedChurchMembersInput): Promise<void> {
  const existing = await testDb
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, churchId));
  for (let index = existing.length; index < total; index += 1) {
    const userId = crypto.randomUUID();
    await buildUser({
      db: testDb,
      id: userId,
      name: `Bulk Member ${index}`,
      email: `bulk-${index}@fixture.test`,
    });
    await buildChurchMembership({
      db: testDb,
      churchId,
      userId,
      accessLevel: 'member',
    });
  }
}

const PLAIN_ADMIN_EMAIL = 'first-admin@plain.test';

interface ProvisionedPlainInvitation {
  churchId: string;
  churchName: string;
  invitationId: string;
  redemptionPath: string;
}

/** The Platform Operator's real provisioning: a Church and its unredeemed first-admin invitation. */
async function provisionPlainInvitation(): Promise<ProvisionedPlainInvitation> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const { church, invitationId, redemptionPath } = await provisionChurch({
    db: testDb,
    churchName: 'Plain Grace Church',
    churchSlug: `plain-grace-${suffix}`,
    adminEmail: PLAIN_ADMIN_EMAIL,
    operatorUserId: fixture.adminA,
    reportRedemptionPath: false,
  });
  return {
    churchId: church.id,
    churchName: church.name,
    invitationId,
    redemptionPath,
  };
}

interface RedeemPlainInput {
  app: FastifyTypedInstance;
  invitationId: string;
  idempotencyKey: string;
  name?: string;
}

async function redeemPlain({
  app,
  invitationId,
  idempotencyKey,
  name = 'First Admin',
}: RedeemPlainInput) {
  return app.inject({
    method: 'POST',
    url: `${redemptionUrl({ invitationId })}/redeem`,
    payload: {
      name,
      password: 'correct horse battery staple',
      code: '123456',
      idempotencyKey,
    },
  });
}

async function findPlainAdmin() {
  const [found] = await testDb
    .select()
    .from(user)
    .where(eq(user.email, PLAIN_ADMIN_EMAIL));
  return found;
}

describe('plain first-admin Church Invitation over HTTP', () => {
  it('previews the printed first-admin link without a Ministry', async () => {
    const plain = await provisionPlainInvitation();
    const { app } = await createHarness();
    // The printed web path maps one-to-one onto the public API route.
    const response = await app.inject({
      method: 'GET',
      url: plain.redemptionPath.replace(
        '/invitations/church/',
        '/api/v1/redemption/church/',
      ),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: PLAIN_ADMIN_EMAIL,
      churchName: plain.churchName,
      churchAccessLevel: 'admin',
      expiresAt: expect.any(String),
    });
  });

  it('expires the provisioned invitation after the configured Church Invitation lifetime', async () => {
    const plain = await provisionPlainInvitation();
    const { app } = await createHarness();

    const response = await app.inject({
      method: 'GET',
      url: redemptionUrl({ invitationId: plain.invitationId }),
    });

    const expiresInMs = Date.parse(response.json().expiresAt) - Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60_000;
    expect(expiresInMs).toBeGreaterThan(sevenDaysMs - 60_000);
    expect(expiresInMs).toBeLessThanOrEqual(sevenDaysMs);
  });

  it('joins as the first ChurchAdmin with no Volunteer and an active session', async () => {
    const plain = await provisionPlainInvitation();
    const { app } = await createHarness();
    await requestCode({ invitationId: plain.invitationId });

    const response = await redeemPlain({
      app,
      invitationId: plain.invitationId,
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
    });

    expect(response.json()).toEqual({
      kind: 'full-success',
      volunteerId: null,
    });
    expect(response.headers['set-cookie']).toContain('session_token=');
    const admin = await findPlainAdmin();
    if (!admin) throw new Error('Expected the first admin.');
    const memberships = await testDb
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, admin.id));
    expect(memberships).toEqual([
      { organizationId: plain.churchId, role: 'admin' },
    ]);
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, admin.id)),
    ).toHaveLength(0);
    const [activeSession] = await testDb
      .select()
      .from(session)
      .where(eq(session.userId, admin.id));
    expect(activeSession?.activeOrganizationId).toBe(plain.churchId);
    const [accepted] = await testDb
      .select({ status: churchInvitation.status })
      .from(churchInvitation)
      .where(eq(churchInvitation.id, plain.invitationId));
    expect(accepted?.status).toBe('accepted');
  });

  it.each([
    'after-account',
    'after-church-admission',
  ] as const)('rolls back a plain join that fails %s and lets the same invitation retry', async (fault) => {
    const plain = await provisionPlainInvitation();
    const { app, identityGateway } = await createHarness();
    identityGateway.failNext = fault;
    await requestCode({ invitationId: plain.invitationId });
    const idempotencyKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const first = await redeemPlain({
      app,
      invitationId: plain.invitationId,
      idempotencyKey,
    });

    expect(first.json()).toEqual({
      kind: 'retryable-failure',
      reason: 'IDENTITY_FAILED',
    });
    expect(first.headers['set-cookie']).toBeUndefined();
    expect(await findPlainAdmin()).toBeUndefined();
    expect(await testDb.select().from(session)).toHaveLength(0);
    expect(
      await testDb
        .select()
        .from(member)
        .where(eq(member.organizationId, plain.churchId)),
    ).toHaveLength(0);

    const retry = await redeemPlain({
      app,
      invitationId: plain.invitationId,
      idempotencyKey,
    });
    expect(retry.json()).toEqual({ kind: 'full-success', volunteerId: null });
  });

  it.each([
    99, 100, 101,
  ])('admits the plain invitee into a Church that already has %i Church Members', async (memberCount) => {
    const plain = await provisionPlainInvitation();
    await seedChurchMembers({ total: memberCount, churchId: plain.churchId });
    const { app } = await createHarness();
    await requestCode({ invitationId: plain.invitationId });

    const response = await redeemPlain({
      app,
      invitationId: plain.invitationId,
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    expect(response.json()).toEqual({
      kind: 'full-success',
      volunteerId: null,
    });
    expect(
      await testDb
        .select()
        .from(member)
        .where(eq(member.organizationId, plain.churchId)),
    ).toHaveLength(memberCount + 1);
  });
});
