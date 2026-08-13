import 'reflect-metadata';
import {
  member,
  ministryInvitation,
  ministryVolunteer,
  session,
} from '@church/db';
import { env } from '@church/env/server';
import { makeSignature } from 'better-auth/crypto';
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
} from '../../src/domain/branded-ids';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleSecurityLogRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
} from '../../src/infrastructure/repositories';
import { BetterAuthRedemptionIdentityGateway } from '../../src/infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../src/infrastructure/services/capture-email-sender';
import { createFastify } from '../../src/main/fastify/setup';
import type { FastifyTypedInstance } from '../../src/main/fastify/types';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from '../integration/repositories/setup';

const verificationCodeRepository =
  new DrizzleInvitationVerificationCodeRepository({ db: testDb });
const redemptionRepository = new DrizzleRedemptionRepository({
  db: testDb,
  volunteerRepository: new DrizzleVolunteerRepository({ db: testDb }),
});
const securityLogRepository = new DrizzleSecurityLogRepository({
  db: testDb,
});
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const { manager: invitationManager, ministryInvitationRepository } =
  createMinistryInvitationTestHarness({ db: testDb });

let app: FastifyTypedInstance;
let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  const verificationCodeManager = new InvitationVerificationCodeManager({
    repository: verificationCodeRepository,
    emailSender: new CaptureEmailSender(),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
  });
  const redemptionManager = new DbRedemptionManager({
    identityGateway: new BetterAuthRedemptionIdentityGateway(),
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
});

afterEach(async () => {
  await app.close();
});

interface CreateSessionCookieInput {
  userId: string;
}

/**
 * A real, correctly-signed Better Auth session cookie for `auth.api.getSession`
 * to accept — the new routes call it directly, so a raw unsigned token (as
 * `redemption.http.test.ts`'s fake identity gateway uses) will not do.
 */
async function createSessionCookie({
  userId,
}: CreateSessionCookieInput): Promise<string> {
  const token = crypto.randomUUID();
  await testDb.insert(session).values({
    id: crypto.randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const signature = await makeSignature(token, env.BETTER_AUTH_SECRET);
  return `better-auth.session_token=${token}.${signature}`;
}

async function mintExistingMemberInvitation() {
  return invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `${fixture.existingChurchMemberA}@fixture.test`,
    ministryAccessLevel: 'volunteer',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
}

describe('Existing-member Ministry Invitation HTTP boundary', () => {
  describe('GET /redemption/ministry/:invitationId', () => {
    it('returns 401 without a session', async () => {
      const invitation = await mintExistingMemberInvitation();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${invitation.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns the redeemable status for the invitation’s intended, authenticated Church Member', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${invitation.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'redeemable',
        email: `${fixture.existingChurchMemberA}@fixture.test`,
        churchName: fixture.churchA.name,
        ministryAccessLevel: 'volunteer',
      });
    });
  });

  describe('POST /redemption/ministry/:invitationId/accept', () => {
    it('returns 401 without a session', async () => {
      const invitation = await mintExistingMemberInvitation();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        payload: { idempotencyKey: crypto.randomUUID() },
      });

      expect(response.statusCode).toBe(401);
    });

    it('grants Ministry Membership to the authenticated Church Member and consumes the invitation', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: { idempotencyKey: crypto.randomUUID() },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ kind: 'full-success' });
      const [acceptedInvitation] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(acceptedInvitation?.status).toBe('accepted');
      const [membership] = await testDb
        .select()
        .from(ministryVolunteer)
        .innerJoin(member, eq(member.userId, fixture.existingChurchMemberA))
        .where(eq(ministryVolunteer.ministryId, fixture.ministryOneA));
      expect(membership).toBeDefined();
    });
  });

  describe('POST /redemption/ministry/:invitationId/decline', () => {
    it('returns 401 without a session', async () => {
      const invitation = await mintExistingMemberInvitation();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/decline`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects the Ministry-only invitation for the authenticated, intended Church Member', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/decline`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: 'declined' });
      const [declinedInvitation] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(declinedInvitation?.status).toBe('rejected');
    });
  });

  describe('POST /redemption/church/:invitationId/decline', () => {
    it('returns 401 without a session', async () => {
      const invitation = await mintExistingMemberInvitation();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/church/${invitation.id}/decline`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('reaches the same decline operation through the chained-route alias', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/church/${invitation.id}/decline`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: 'declined' });
      const [declinedInvitation] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(
          and(
            eq(ministryInvitation.id, invitation.id),
            eq(ministryInvitation.status, 'rejected'),
          ),
        );
      expect(declinedInvitation).toBeDefined();
    });
  });
});
