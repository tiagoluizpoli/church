import 'reflect-metadata';
import {
  invitation as churchInvitation,
  member,
  ministryInvitation,
  ministryVolunteer,
  ministryVolunteerRole,
  outboxMessage,
  session,
  user,
  volunteer,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedemptionController } from '../../src/api/controllers/redemption-controller';
import { DbRedemptionManager } from '../../src/application/db-redemption-manager';
import { InvitationVerificationCodeManager } from '../../src/application/invitation-verification-code-manager';
import {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  type VolunteerId,
} from '../../src/domain/branded-ids';
import type {
  AcceptMinistryInvitationInput,
  DeclineMinistryInvitationInput,
  RedemptionRepository,
} from '../../src/domain/contracts/infrastructure/redemption.repository';
import type {
  AcceptChurchInvitationInput,
  CreateRedemptionAccountInput,
  CreateRedemptionAccountOutput,
  RedemptionIdentityGateway,
  RejectChurchInvitationInput,
  SetActiveRedemptionChurchInput,
} from '../../src/domain/contracts/infrastructure/redemption-identity-gateway';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleSecurityLogRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
} from '../../src/infrastructure/repositories';
import { CaptureEmailSender } from '../../src/infrastructure/services/capture-email-sender';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from '../integration/repositories/setup';

interface TestRedemptionIdentityGatewayInput {
  db: typeof testDb;
}

class TestRedemptionIdentityGateway implements RedemptionIdentityGateway {
  constructor({ db }: TestRedemptionIdentityGatewayInput) {
    this.db = db;
  }

  private readonly db: typeof testDb;
  createAccountCalls = 0;

  async createAccount({
    email,
    name,
  }: CreateRedemptionAccountInput): Promise<CreateRedemptionAccountOutput> {
    this.createAccountCalls += 1;
    const [existingUser] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    const userId = existingUser?.id ?? crypto.randomUUID();
    if (!existingUser) {
      await this.db.insert(user).values({
        id: userId,
        name,
        email,
        emailVerified: true,
      });
    }

    const sessionToken = crypto.randomUUID();
    await this.db.insert(session).values({
      id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      token: sessionToken,
      userId,
    });
    return {
      userId: UserId.from(userId),
      sessionCookie: `session_token=${sessionToken}; HttpOnly; Path=/`,
    };
  }

  async acceptChurchInvitation({
    churchInvitationId,
    sessionCookie,
  }: AcceptChurchInvitationInput): Promise<void> {
    const [pendingInvitation] = await this.db
      .select()
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    if (!pendingInvitation)
      throw new Error('Church invitation was unavailable.');

    const [activeSession] = await this.db
      .select({ userId: session.userId })
      .from(session)
      .where(eq(session.token, tokenFromCookie({ sessionCookie })))
      .limit(1);
    if (!activeSession) throw new Error('Session was unavailable.');

    await this.db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: pendingInvitation.organizationId,
      userId: activeSession.userId,
      role: pendingInvitation.role ?? 'member',
    });
    await this.db
      .update(churchInvitation)
      .set({ status: 'accepted' })
      .where(eq(churchInvitation.id, churchInvitationId));
  }

  async rejectChurchInvitation({
    churchInvitationId,
    sessionCookie,
  }: RejectChurchInvitationInput): Promise<void> {
    const [activeSession] = await this.db
      .select({ userId: session.userId })
      .from(session)
      .where(eq(session.token, tokenFromCookie({ sessionCookie })))
      .limit(1);
    if (!activeSession) throw new Error('Session was unavailable.');
    await this.db
      .update(churchInvitation)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      );
  }

  async setActiveChurch({
    churchId,
    sessionCookie,
  }: SetActiveRedemptionChurchInput): Promise<void> {
    await this.db
      .update(session)
      .set({ activeOrganizationId: churchId })
      .where(eq(session.token, tokenFromCookie({ sessionCookie })));
  }
}

interface TokenFromCookieInput {
  sessionCookie: string;
}

function tokenFromCookie({ sessionCookie }: TokenFromCookieInput): string {
  const [, value] = /session_token=([^;]+)/.exec(sessionCookie) ?? [];
  if (!value) throw new Error('Session cookie did not carry a session token.');
  return value;
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
}

interface RedemptionHttpHarness {
  app: FastifyTypedInstance;
  identityGateway: TestRedemptionIdentityGateway;
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
  });
const drizzleRedemptionRepository = new DrizzleRedemptionRepository({
  db: testDb,
  volunteerRepository: new DrizzleVolunteerRepository({ db: testDb }),
});
const securityLogRepository = new DrizzleSecurityLogRepository({
  db: testDb,
});
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const { manager: invitationManager, ministryInvitationRepository } =
  createMinistryInvitationTestHarness({ db: testDb });

let app: FastifyTypedInstance | undefined;
let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function createHarness({
  redemptionRepository = drizzleRedemptionRepository,
}: CreateHarnessInput = {}): Promise<RedemptionHttpHarness> {
  const identityGateway = new TestRedemptionIdentityGateway({ db: testDb });
  const verificationCodeManager = new InvitationVerificationCodeManager({
    repository: verificationCodeRepository,
    emailSender: new CaptureEmailSender(),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
  });
  const redemptionManager = new DbRedemptionManager({
    identityGateway,
    invitationRepository: ministryInvitationRepository,
    invitationVerificationCodeManager: verificationCodeManager,
    redemptionRepository,
    securityLogRepository,
    unitOfWork,
  });
  app = await createFastify();
  const controller = new RedemptionController({ redemptionManager });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
  return { app, identityGateway };
}

async function mintInvitation() {
  return invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `redemption-${fixture.churchA.slug}@fixture.test`,
    ministryAccessLevel: 'leader',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
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
      url: redemptionUrl({ invitationId: invitation.id }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: `redemption-${fixture.churchA.slug}@fixture.test`,
      churchName: fixture.churchA.name,
      ministryName: expect.stringMatching(/^Worship /),
      ministryAccessLevel: 'leader',
      roleNames: [expect.stringMatching(/^Vocalist /)],
      expiresAt: expect.any(String),
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
        .update(ministryInvitation)
        .set(
          state === 'expired'
            ? { expiresAt: new Date('2000-01-01T00:00:00.000Z') }
            : { status: state },
        )
        .where(eq(ministryInvitation.id, invitation.id));
      const response = await app.inject({
        method: 'GET',
        url: redemptionUrl({ invitationId: invitation.id }),
      });
      expect(response.statusCode).toBe(404);
      unavailableBodies.push(response.body);
      if (state === 'expired') {
        await testDb
          .update(ministryInvitation)
          .set({ expiresAt: new Date(Date.now() + 60 * 60_000) })
          .where(eq(ministryInvitation.id, invitation.id));
      }
    }

    expect(unavailableBodies).toEqual([
      '{"error":"INVITATION_UNAVAILABLE"}',
      '{"error":"INVITATION_UNAVAILABLE"}',
      '{"error":"INVITATION_UNAVAILABLE"}',
      '{"error":"INVITATION_UNAVAILABLE"}',
      '{"error":"INVITATION_UNAVAILABLE"}',
    ]);
  });

  it('verifies the code before creating identity state and returns a terminal verification failure', async () => {
    const invitation = await mintInvitation();
    const { app, identityGateway } = await createHarness();

    const response = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
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
    expect(identityGateway.createAccountCalls).toBe(0);
    const users = await testDb.select().from(user);
    expect(users).toHaveLength(7);
  });

  it('redeems through Fastify, persists every checkpoint, and returns the authenticated cookie', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    const codeResponse = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/code`,
    });
    expect(codeResponse.statusCode).toBe(200);

    const idempotencyKey = '22222222-2222-4222-8222-222222222222';
    const response = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
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
    const [membership] = await testDb
      .select()
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.volunteerId, createdVolunteer.id));
    expect(membership?.ministryId).toBe(fixture.ministryOneA);
    expect(membership?.ministryAccessLevel).toBe('leader');
    if (!membership) throw new Error('Expected redeemed ministry membership.');
    const grants = await testDb
      .select()
      .from(ministryVolunteerRole)
      .where(eq(ministryVolunteerRole.ministryVolunteerId, membership.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.roleId).toBe(fixture.roleInMinistryOneA);
    const [acceptedMinistryInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    expect(acceptedMinistryInvitation?.status).toBe('accepted');
    const confirmations = await testDb
      .select()
      .from(outboxMessage)
      .where(
        and(
          eq(outboxMessage.kind, 'redemption.accepted'),
          eq(outboxMessage.correlationId, idempotencyKey),
        ),
      );
    expect(confirmations).toHaveLength(1);
  });

  it('serializes duplicate submissions so only the request that consumes the code creates grants', async () => {
    const invitation = await mintInvitation();
    const { app } = await createHarness();
    await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/code`,
    });
    const basePayload = {
      name: 'Concurrent HTTP User',
      password: 'correct horse battery staple',
      code: '123456',
    };

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
        payload: {
          ...basePayload,
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
        },
      }),
      app.inject({
        method: 'POST',
        url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
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
    expect(
      await testDb
        .select()
        .from(outboxMessage)
        .where(eq(outboxMessage.kind, 'redemption.accepted')),
    ).toHaveLength(1);
  });

  it('rolls back checkpoint three and safely resumes with the same idempotency key', async () => {
    const invitation = await mintInvitation();
    const failingRepository = new FailOnceAfterCheckpointThreeRepository({
      delegate: drizzleRedemptionRepository,
    });
    const { app } = await createHarness({
      redemptionRepository: failingRepository,
    });
    await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/code`,
    });
    const idempotencyKey = '33333333-3333-4333-8333-333333333333';
    const payload = {
      name: 'Retry HTTP User',
      password: 'correct horse battery staple',
      code: '123456',
      idempotencyKey,
    };

    const firstResponse = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
      payload,
    });
    expect(firstResponse.json()).toEqual({
      kind: 'retryable-failure',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    });
    const email = `redemption-${fixture.churchA.slug}@fixture.test`;
    const [redeemedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.email, email));
    expect(redeemedUser).toBeDefined();
    if (!redeemedUser) throw new Error('Expected identity checkpoint user.');
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, redeemedUser.id)),
    ).toHaveLength(0);
    expect(
      await testDb
        .select()
        .from(outboxMessage)
        .where(eq(outboxMessage.kind, 'redemption.accepted')),
    ).toHaveLength(0);
    const [pendingInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    expect(pendingInvitation?.status).toBe('pending');

    const retryResponse = await app.inject({
      method: 'POST',
      url: `${redemptionUrl({ invitationId: invitation.id })}/redeem`,
      payload,
    });
    expect(retryResponse.json()).toMatchObject({ kind: 'full-success' });
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, redeemedUser.id)),
    ).toHaveLength(1);
    expect(
      await testDb
        .select()
        .from(outboxMessage)
        .where(
          and(
            eq(outboxMessage.kind, 'redemption.accepted'),
            eq(outboxMessage.correlationId, idempotencyKey),
          ),
        ),
    ).toHaveLength(1);
  });
});
