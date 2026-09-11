import 'reflect-metadata';
import {
  invitation as churchInvitation,
  identityAudit,
  member,
  ministryInvitation,
  ministryVolunteer,
  outboxMessage,
  session,
  user,
  volunteer,
} from '@church/db';
import { env } from '@church/env/server';
import { makeSignature } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
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
const {
  manager: invitationManager,
  ministryInvitationRepository,
  churchRepository,
} = createMinistryInvitationTestHarness({ db: testDb });

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
    churchRepository,
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

/**
 * Mints for an email that matches no existing Church Member, which per spec
 * §5.3 resolves the mint to the chained Church Invitation + Ministry
 * Invitation pair — unlike `mintExistingMemberInvitation`, whose fixture
 * email always belongs to a real Church Member and so is never chained.
 */
async function mintChainedInvitation() {
  const email = `outsider-${crypto.randomUUID()}@fixture.test`;
  const invitation = await invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email,
    ministryAccessLevel: 'volunteer',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
  return { invitation, email };
}

interface CreateUserSessionInput {
  email: string;
}

/** A real User + signed session for a chained invitation's own email — the person Better Auth's `rejectInvitation` requires to be signed in. */
async function createUserSession({
  email,
}: CreateUserSessionInput): Promise<string> {
  const userId = crypto.randomUUID();
  await testDb.insert(user).values({
    id: userId,
    name: 'Chained Invitee',
    email,
    emailVerified: true,
  });
  return createSessionCookie({ userId });
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

    it('splits when the member already holds an active Volunteer profile in another Church (spec §7.5)', async () => {
      // dualMemberAB is a Church Member of A and B, active Volunteer in B.
      const invitation = await invitationManager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.dualMemberAB}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
      });
      const cookie = await createSessionCookie({
        userId: fixture.dualMemberAB,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: { idempotencyKey: crypto.randomUUID() },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        kind: 'church-only',
        sourceChurchName: fixture.churchB.name,
        destinationChurchName: fixture.churchA.name,
        ministryInvitationId: invitation.id,
      });

      // The Ministry half is refused: invitation stays pending, no grant, no
      // Volunteer profile in Church A, and one church_only_partial_acceptance
      // audit row and no outbox row.
      const [stillPending] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(stillPending?.status).toBe('pending');
      const dualProfiles = await testDb
        .select({ churchId: volunteer.churchId })
        .from(volunteer)
        .where(eq(volunteer.userId, fixture.dualMemberAB));
      expect(dualProfiles).toEqual([{ churchId: fixture.churchB.id }]);
      const audits = await testDb
        .select({ action: identityAudit.action })
        .from(identityAudit)
        .where(eq(identityAudit.ministryInvitationId, invitation.id));
      expect(audits).toEqual([{ action: 'church_only_partial_acceptance' }]);
      // The split writes no grant-side outbox row — only the mint's own
      // delivery row exists.
      const outboxKinds = await testDb
        .select({ kind: outboxMessage.kind })
        .from(outboxMessage)
        .where(eq(outboxMessage.churchId, fixture.churchA.id));
      expect(outboxKinds).toEqual([{ kind: 'invitation.ministry' }]);
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

    it('rejects both halves of a chained invitation for its own intended person', async () => {
      const { invitation, email } = await mintChainedInvitation();
      const cookie = await createUserSession({ email });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/church/${invitation.id}/decline`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: 'declined' });
      const [declinedInvitation] = await testDb
        .select({
          status: ministryInvitation.status,
          churchInvitationId: ministryInvitation.churchInvitationId,
        })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(declinedInvitation?.status).toBe('rejected');
      const [declinedChurchInvitation] = await testDb
        .select({ status: churchInvitation.status })
        .from(churchInvitation)
        .where(
          eq(
            churchInvitation.id,
            declinedInvitation?.churchInvitationId as string,
          ),
        );
      expect(declinedChurchInvitation?.status).toBe('rejected');
    });
  });
});
