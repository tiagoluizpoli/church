import { appConfig } from '@church/app-config';
import {
  invitation as churchInvitation,
  invitationVerificationCode,
  member,
  ministryInvitation,
  outboxMessage,
  session,
  user,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedemptionController } from '@/api/controllers/redemption-controller';
import { DbRedemptionManager } from '@/application/db-redemption-manager';
import { DbVolunteerTransferManager } from '@/application/db-volunteer-transfer-manager';
import { InvitationVerificationCodeManager } from '@/application/invitation-verification-code-manager';
import { ChurchId, MinistryId, RoleId, UserId } from '@/domain/branded-ids';
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
import { ConsoleRedemptionFailureLog } from '@/infrastructure/services/console-redemption-failure-log';
import { auth, createServerAuth } from '@/main/di/server-auth';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { provisionChurch } from '@/scripts/provision-church';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

interface PairedInvitation {
  ministryInvitationId: string;
  churchInvitationId: string;
}

interface InvitationIdInput {
  invitationId: string;
}

interface PostInput {
  url: string;
  remoteAddress?: string;
}

const gateway = new BetterAuthRedemptionIdentityGateway({
  auth,
  createTransactionAuth: createServerAuth,
});
const {
  manager: invitationManager,
  ministryInvitationRepository,
  churchRepository,
  notifications,
} = createMinistryInvitationTestHarness({ db: testDb });
const volunteerRepository = new DrizzleVolunteerRepository({ db: testDb });
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const securityLogRepository = new DrizzleSecurityLogRepository({
  db: testDb,
});

let app: FastifyTypedInstance;
let fixture: TwoChurchIdentityFixture;
let userCount = 0;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  userCount = (await testDb.select().from(user)).length;
  const redemptionManager = new DbRedemptionManager({
    churchRepository,
    identityGateway: gateway,
    invitationRepository: ministryInvitationRepository,
    invitationVerificationCodeManager: new InvitationVerificationCodeManager({
      repository: new DrizzleInvitationVerificationCodeRepository({
        db: testDb,
        config: appConfig,
      }),
      emailSender: new CaptureEmailSender('Church'),
      generateCode: () => '123456',
      verificationCodeSecret: 'test-secret',
      config: appConfig,
    }),
    redemptionRepository: new DrizzleRedemptionRepository({
      db: testDb,
      volunteerRepository,
    }),
    securityLogRepository,
    unitOfWork,
    failureLog: new ConsoleRedemptionFailureLog(),
  });
  const controller = new RedemptionController({
    redemptionManager,
    volunteerTransferManager: new DbVolunteerTransferManager({
      churchRepository,
      identityGateway: gateway,
      invitationRepository: ministryInvitationRepository,
      notifications,
      securityLogRepository,
      unitOfWork,
      volunteerRepository,
      volunteerTransferRepository: new DrizzleVolunteerTransferRepository({
        db: testDb,
      }),
    }),
    config: appConfig,
  });
  app = await createFastify({ locale: testLocale });
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

afterEach(async () => {
  await app.close();
});

async function mintPaired(): Promise<PairedInvitation> {
  const minted = await invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `decline-${fixture.churchA.slug}@fixture.test`,
    ministryAccessLevel: 'leader',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
  if (!minted.churchInvitationId) throw new Error('Expected a paired pair.');
  return {
    ministryInvitationId: minted.id,
    churchInvitationId: minted.churchInvitationId,
  };
}

function post({ url, remoteAddress }: PostInput) {
  return app.inject({ method: 'POST', url, remoteAddress });
}

function decline({ invitationId }: InvitationIdInput) {
  return post({ url: `/api/v1/redemption/church/${invitationId}/decline` });
}

async function churchStatus({ invitationId }: InvitationIdInput) {
  const [row] = await testDb
    .select({ status: churchInvitation.status })
    .from(churchInvitation)
    .where(eq(churchInvitation.id, invitationId));
  return row?.status;
}

async function ministryStatus({ invitationId }: InvitationIdInput) {
  const [row] = await testDb
    .select({ status: ministryInvitation.status })
    .from(ministryInvitation)
    .where(eq(ministryInvitation.id, invitationId));
  return row?.status;
}

describe('public Church Invitation decline over HTTP', () => {
  it('declines a paired invitation signed out, rejecting both halves with no identity, session, membership or notice', async () => {
    const pair = await mintPaired();
    const outboxBefore = (await testDb.select().from(outboxMessage)).length;
    const membersBefore = (await testDb.select().from(member)).length;
    const sessionsBefore = (await testDb.select().from(session)).length;

    const response = await decline({ invitationId: pair.churchInvitationId });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'declined' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await churchStatus({ invitationId: pair.churchInvitationId })).toBe(
      'rejected',
    );
    expect(
      await ministryStatus({ invitationId: pair.ministryInvitationId }),
    ).toBe('rejected');
    expect(await testDb.select().from(user)).toHaveLength(userCount);
    expect(await testDb.select().from(session)).toHaveLength(sessionsBefore);
    expect(await testDb.select().from(member)).toHaveLength(membersBefore);
    expect(await testDb.select().from(outboxMessage)).toHaveLength(
      outboxBefore,
    );
  });

  it('declines a plain provisioned invitation', async () => {
    const { invitationId } = await provisionChurch({
      db: testDb,
      churchName: 'Plain Grace Church',
      churchSlug: `plain-grace-${crypto.randomUUID().slice(0, 8)}`,
      adminEmail: 'first-admin@fixture.test',
      operatorUserId: fixture.adminA,
      reportRedemptionPath: false,
    });

    const response = await decline({ invitationId });

    expect(response.json()).toEqual({ kind: 'declined' });
    expect(await churchStatus({ invitationId })).toBe('rejected');
  });

  it('invalidates an issued verification code', async () => {
    const pair = await mintPaired();
    const codeUrl = `/api/v1/redemption/church/${pair.churchInvitationId}/code`;
    expect((await post({ url: codeUrl })).statusCode).toBe(200);
    expect(await testDb.select().from(invitationVerificationCode)).toHaveLength(
      1,
    );

    await decline({ invitationId: pair.churchInvitationId });

    expect(await testDb.select().from(invitationVerificationCode)).toHaveLength(
      0,
    );
    expect((await post({ url: codeUrl })).statusCode).toBe(404);
  });

  it('treats a repeated decline as harmless', async () => {
    const pair = await mintPaired();
    await decline({ invitationId: pair.churchInvitationId });

    const again = await decline({ invitationId: pair.churchInvitationId });

    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ kind: 'declined' });
  });

  it.each([
    ['accepted', { status: 'accepted' }],
    ['canceled', { status: 'canceled' }],
    ['expired', { expiresAt: new Date('2000-01-01T00:00:00.000Z') }],
  ] as const)('refuses an %s invitation as unavailable without changing it', async (state, patch) => {
    const pair = await mintPaired();
    await testDb
      .update(churchInvitation)
      .set(patch)
      .where(eq(churchInvitation.id, pair.churchInvitationId));

    const response = await decline({ invitationId: pair.churchInvitationId });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'INVITATION_UNAVAILABLE' });
    expect(await churchStatus({ invitationId: pair.churchInvitationId })).toBe(
      state === 'expired' ? 'pending' : state,
    );
    expect(
      await ministryStatus({ invitationId: pair.ministryInvitationId }),
    ).toBe('pending');
  });

  it('returns the unavailable response for an unknown invitation', async () => {
    const response = await decline({
      invitationId: '00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'INVITATION_UNAVAILABLE' });
  });

  it('is throttled with 429 RATE_LIMITED', async () => {
    const url =
      '/api/v1/redemption/church/00000000-0000-4000-8000-000000000000/decline';
    const remoteAddress = '203.0.113.77';
    let last = await post({ url, remoteAddress });
    for (let i = 0; i < appConfig.redemptionRateLimit.maxRequests; i++) {
      last = await post({ url, remoteAddress });
    }

    expect(last.statusCode).toBe(429);
    expect(last.json()).toMatchObject({ error: 'RATE_LIMITED' });
  });

  it('leaves one valid final outcome when a decline races an acceptance', async () => {
    const pair = await mintPaired();
    await post({
      url: `/api/v1/redemption/church/${pair.churchInvitationId}/code`,
    });

    const [declined, redeemed] = await Promise.all([
      decline({ invitationId: pair.churchInvitationId }),
      app.inject({
        method: 'POST',
        url: `/api/v1/redemption/church/${pair.churchInvitationId}/redeem`,
        payload: {
          name: 'Racer',
          password: 'correct horse battery staple',
          code: '123456',
          idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
      }),
    ]);

    const church = await churchStatus({
      invitationId: pair.churchInvitationId,
    });
    const ministry = await ministryStatus({
      invitationId: pair.ministryInvitationId,
    });
    const users = await testDb.select().from(user);
    if (church === 'rejected') {
      expect(ministry).toBe('rejected');
      expect(users).toHaveLength(userCount);
      expect(redeemed.json()).not.toMatchObject({ kind: 'full-success' });
    } else {
      expect(church).toBe('accepted');
      expect(ministry).toBe('accepted');
      expect(declined.statusCode).toBe(404);
    }
  });
});
