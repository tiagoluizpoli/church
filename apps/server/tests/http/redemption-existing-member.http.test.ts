import { appConfig } from '@church/app-config';
import {
  account,
  availabilityCheck,
  identityAudit,
  member,
  ministry,
  ministryInvitation,
  ministryMembership,
  ministryMembershipRole,
  outboxMessage,
  role,
  securityLog,
  session,
  user,
  volunteer,
} from '@church/db';
import { env } from '@church/env/server';
import { parseInstant } from '@church/time';
import { hashPassword, makeSignature } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
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
import { auth, createServerAuth } from '@/main/di/server-auth';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildCycle } from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '@/tests/test-support/ministry-invitation-test-harness';

const verificationCodeRepository =
  new DrizzleInvitationVerificationCodeRepository({
    db: testDb,
    config: appConfig,
  });
const volunteerRepository = new DrizzleVolunteerRepository({ db: testDb });
const redemptionRepository = new DrizzleRedemptionRepository({
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

let app: FastifyTypedInstance;
let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
  const verificationCodeManager = new InvitationVerificationCodeManager({
    repository: verificationCodeRepository,
    emailSender: new CaptureEmailSender('Church'),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
    config: appConfig,
  });
  const identityGateway = new BetterAuthRedemptionIdentityGateway({
    auth,
    createTransactionAuth: createServerAuth,
  });
  const redemptionManager = new DbRedemptionManager({
    churchRepository,
    identityGateway,
    invitationRepository: ministryInvitationRepository,
    invitationVerificationCodeManager: verificationCodeManager,
    redemptionRepository,
    securityLogRepository,
    unitOfWork,
    failureLog: { record: () => {} },
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

async function ministryNameOf(id: string): Promise<string> {
  const [row] = await testDb
    .select({ name: ministry.name })
    .from(ministry)
    .where(eq(ministry.id, id));
  return row?.name ?? '';
}

async function roleNameOf(id: string): Promise<string> {
  const [row] = await testDb
    .select({ name: role.name })
    .from(role)
    .where(eq(role.id, id));
  return row?.name ?? '';
}

/**
 * adminB (a User of Church B, no Church A membership) is offered Church A as
 * ChurchAdmin, Worship as a Volunteer with one Role and Kids as a leader with
 * no Roles — one Church Invitation with two Ministry halves.
 */
async function mintAdminBundleForAdminB() {
  const email = `${fixture.adminB}@fixture.test`;
  const worship = await invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email,
    ministryAccessLevel: 'volunteer',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
  const kids = await invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryTwoA),
    inviterId: UserId.from(fixture.adminA),
    email,
    ministryAccessLevel: 'leader',
    roleIds: [],
  });
  await invitationManager.mintAdmin({
    churchId: ChurchId.from(fixture.churchA.id),
    inviterId: UserId.from(fixture.adminA),
    email,
  });
  return {
    email,
    churchInvitationId: worship.churchInvitationId as string,
    worshipId: worship.id,
    kidsId: kids.id,
  };
}

interface StaleBundle {
  kidsId: string | undefined;
}

interface ReviewedAcceptanceInput {
  invitationId: string;
  cookie: string | undefined;
}

/** Reviews the offer as the caller (GET status), then echoes its review token on accept. */
async function reviewedAcceptance({
  invitationId,
  cookie,
}: ReviewedAcceptanceInput) {
  const status = await app.inject({
    method: 'GET',
    url: `/api/v1/redemption/ministry/${invitationId}`,
    headers: cookie ? { cookie } : {},
  });
  const reviewed = status.statusCode === 200 ? status.json() : {};
  return {
    idempotencyKey: crypto.randomUUID(),
    reviewToken: reviewed.reviewToken ?? 'never-reviewed',
  };
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

    it('discloses a standalone Ministry offer alone, with the Church as existing access', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${invitation.id}`,
        headers: { cookie },
      });

      const body = response.json();
      expect(body).toMatchObject({
        invitationKind: 'ministry-only',
        churchAccessLevel: null,
        ministries: [
          {
            invitationId: invitation.id,
            ministryName: await ministryNameOf(fixture.ministryOneA),
            ministryAccessLevel: 'volunteer',
            roleNames: [await roleNameOf(fixture.roleInMinistryOneA)],
            inviterName: 'Fixture Admin A',
          },
        ],
      });
      expect(body.reviewToken).toEqual(expect.any(String));
    });

    it('discloses the whole Church offer from any of its halves: the new Church Access Level and every Ministry grant', async () => {
      const bundle = await mintAdminBundleForAdminB();
      const cookie = await createSessionCookie({ userId: fixture.adminB });

      const fromWorship = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${bundle.worshipId}`,
        headers: { cookie },
      });
      const fromKids = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${bundle.kidsId}`,
        headers: { cookie },
      });

      const disclosed = fromWorship.json();
      expect(disclosed).toMatchObject({
        kind: 'redeemable',
        invitationKind: 'chained',
        churchName: fixture.churchA.name,
        churchAccessLevel: 'admin',
        ministries: [
          {
            invitationId: bundle.worshipId,
            ministryName: await ministryNameOf(fixture.ministryOneA),
            ministryAccessLevel: 'volunteer',
            roleNames: [await roleNameOf(fixture.roleInMinistryOneA)],
            inviterName: 'Fixture Admin A',
            expiresAt: expect.any(String),
          },
          {
            invitationId: bundle.kidsId,
            ministryName: await ministryNameOf(fixture.ministryTwoA),
            ministryAccessLevel: 'leader',
            roleNames: [],
            inviterName: 'Fixture Admin A',
            expiresAt: expect.any(String),
          },
        ],
      });
      expect(fromKids.json().ministries).toEqual(disclosed.ministries);
      expect(fromKids.json().reviewToken).toBe(disclosed.reviewToken);
    });
  });

  describe('POST /redemption/ministry/:invitationId/accept', () => {
    it('returns 401 without a session', async () => {
      const invitation = await mintExistingMemberInvitation();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: undefined,
        }),
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
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ kind: 'full-success' });
      const [acceptedInvitation] = await testDb
        .select({
          status: ministryInvitation.status,
          acceptedAt: ministryInvitation.acceptedAt,
        })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(acceptedInvitation?.status).toBe('accepted');
      expect(acceptedInvitation?.acceptedAt).toBeInstanceOf(Date);
      const [membership] = await testDb
        .select()
        .from(ministryMembership)
        .innerJoin(member, eq(member.userId, fixture.existingChurchMemberA))
        .where(eq(ministryMembership.ministryId, fixture.ministryOneA));
      expect(membership).toBeDefined();
    });

    it('rejoins a removed member into a fresh active membership, leaving the ended one and its checks as history', async () => {
      const profile = await buildVolunteer({
        db: testDb,
        churchId: fixture.churchA.id,
        userId: fixture.existingChurchMemberA,
      });
      const leftAt = parseInstant({ value: '2026-10-01T12:00:00Z' });
      const ended = await buildMinistryMembership({
        db: testDb,
        churchId: fixture.churchA.id,
        volunteerId: profile.id,
        ministryId: fixture.ministryOneA,
        ministryAccessLevel: 'volunteer',
        status: 'inactive',
        leftAt,
        roleIds: [fixture.roleInMinistryOneA],
      });
      const cycle = await buildCycle({
        db: testDb,
        churchId: fixture.churchA.id,
        name: 'Outubro',
        startDate: '2026-10-01' as never,
        endDate: '2026-10-31' as never,
        state: 'sent',
      });
      const withdrawn = await buildAvailabilityCheck({
        db: testDb,
        churchId: fixture.churchA.id,
        cycleId: cycle.id,
        ministryMembershipId: ended.id,
        withdrawnAt: leftAt,
      });

      // An ended member is not an active one, so the normal invitation mints.
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.statusCode).toBe(200);
      const rows = await testDb
        .select({
          id: ministryMembership.id,
          volunteerId: ministryMembership.volunteerId,
          status: ministryMembership.status,
          leftAt: ministryMembership.leftAt,
        })
        .from(ministryMembership)
        .where(
          and(
            eq(ministryMembership.ministryId, fixture.ministryOneA),
            eq(ministryMembership.volunteerId, profile.id),
          ),
        );
      expect(rows).toHaveLength(2);
      const fresh = rows.find((row) => row.id !== ended.id);
      expect(rows.find((row) => row.id === ended.id)).toMatchObject({
        status: 'inactive',
        leftAt: new Date('2026-10-01T12:00:00Z'),
      });
      expect(fresh).toMatchObject({
        volunteerId: profile.id,
        status: 'active',
        leftAt: null,
      });
      const roleOwners = await testDb
        .select({ membershipId: ministryMembershipRole.ministryMembershipId })
        .from(ministryMembershipRole)
        .where(eq(ministryMembershipRole.roleId, fixture.roleInMinistryOneA));
      expect(roleOwners.map((row) => row.membershipId).sort()).toEqual(
        [ended.id, fresh?.id].sort(),
      );
      const checks = await testDb.select().from(availabilityCheck);
      expect(checks).toEqual([
        expect.objectContaining({
          id: withdrawn.id,
          ministryMembershipId: ended.id,
          withdrawnAt: new Date('2026-10-01T12:00:00Z'),
        }),
      ]);
    });

    it('lets a signed-in User from another Church accept a Church offer with two Ministry halves through one Volunteer profile', async () => {
      // adminB has an account and a Church B membership, but no membership in A.
      const email = `${fixture.adminB}@fixture.test`;
      const mintHalf = (input: {
        ministryId: string;
        ministryAccessLevel: 'volunteer' | 'leader';
        roleIds: string[];
      }) =>
        invitationManager.mint({
          churchId: ChurchId.from(fixture.churchA.id),
          ministryId: MinistryId.from(input.ministryId),
          inviterId: UserId.from(fixture.adminA),
          email,
          ministryAccessLevel: input.ministryAccessLevel,
          roleIds: input.roleIds.map((id) => RoleId.from(id)),
        });
      const first = await mintHalf({
        ministryId: fixture.ministryOneA,
        ministryAccessLevel: 'volunteer',
        roleIds: [fixture.roleInMinistryOneA],
      });
      await mintHalf({
        ministryId: fixture.ministryTwoA,
        ministryAccessLevel: 'leader',
        roleIds: [],
      });
      const cookie = await createSessionCookie({ userId: fixture.adminB });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${first.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: first.id,
          cookie: cookie,
        }),
      });

      expect(response.json()).toMatchObject({ kind: 'full-success' });
      expect(
        await testDb
          .select({ role: member.role })
          .from(member)
          .where(
            and(
              eq(member.userId, fixture.adminB),
              eq(member.organizationId, fixture.churchA.id),
            ),
          ),
      ).toEqual([{ role: 'member' }]);
      const profiles = await testDb
        .select({ id: volunteer.id })
        .from(volunteer)
        .where(
          and(
            eq(volunteer.userId, fixture.adminB),
            eq(volunteer.churchId, fixture.churchA.id),
          ),
        );
      expect(profiles).toHaveLength(1);
      const grants = await testDb
        .select({
          volunteerId: ministryMembership.volunteerId,
          ministryId: ministryMembership.ministryId,
          ministryAccessLevel: ministryMembership.ministryAccessLevel,
        })
        .from(ministryMembership)
        .where(eq(ministryMembership.volunteerId, profiles[0]?.id ?? ''));
      expect(grants).toHaveLength(2);
      expect(grants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ministryId: fixture.ministryOneA,
            ministryAccessLevel: 'volunteer',
          }),
          expect.objectContaining({
            ministryId: fixture.ministryTwoA,
            ministryAccessLevel: 'leader',
          }),
        ]),
      );
    });

    it('refuses acceptance into an archived Ministry, granting nothing and keeping the invitation pending', async () => {
      const invitation = await mintExistingMemberInvitation();
      const memberships = () =>
        testDb
          .select()
          .from(ministryMembership)
          .where(eq(ministryMembership.ministryId, fixture.ministryOneA));
      const before = (await memberships()).length;
      await testDb
        .update(ministry)
        .set({ deletedAt: new Date() })
        .where(eq(ministry.id, fixture.ministryOneA));
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.json().kind).not.toBe('full-success');
      const [pendingInvitation] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(pendingInvitation?.status).toBe('pending');
      expect(await memberships()).toHaveLength(before);
    });

    it('refuses acceptance when a minted Role was archived since, granting nothing and keeping the invitation pending', async () => {
      const invitation = await mintExistingMemberInvitation();
      await testDb
        .update(role)
        .set({ archivedAt: new Date() })
        .where(eq(role.id, fixture.roleInMinistryOneA));
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.json().kind).not.toBe('full-success');
      const [pendingInvitation] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(pendingInvitation?.status).toBe('pending');
      expect(
        await testDb
          .select()
          .from(ministryMembershipRole)
          .where(eq(ministryMembershipRole.roleId, fixture.roleInMinistryOneA)),
      ).toHaveLength(0);
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
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        kind: 'church-only',
        sourceChurchName: fixture.churchB.name,
        destinationChurchId: fixture.churchA.id,
        destinationChurchName: fixture.churchA.name,
        ministryInvitationId: invitation.id,
        ministryName: expect.stringMatching(/^Worship /),
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
      expect(outboxKinds).toEqual([{ kind: 'notification' }]);
    });
  });

  describe('reviewed bundle consistency', () => {
    async function churchAAccessOf(userId: string) {
      return testDb
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.userId, userId),
            eq(member.organizationId, fixture.churchA.id),
          ),
        );
    }

    async function grantedMinistriesOf(userId: string) {
      const rows = await testDb
        .select({
          ministryId: ministryMembership.ministryId,
          ministryAccessLevel: ministryMembership.ministryAccessLevel,
        })
        .from(ministryMembership)
        .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
        .where(
          and(
            eq(volunteer.userId, userId),
            eq(volunteer.churchId, fixture.churchA.id),
          ),
        )
        .orderBy(ministryMembership.ministryId);
      return rows;
    }

    async function invitationStatusOf(id: string) {
      const [row] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, id));
      return row?.status;
    }

    it('one acceptance grants exactly the reviewed bundle: the Church Access Level and every Ministry', async () => {
      const bundle = await mintAdminBundleForAdminB();
      const cookie = await createSessionCookie({ userId: fixture.adminB });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${bundle.kidsId}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: bundle.kidsId,
          cookie,
        }),
      });

      expect(response.json()).toMatchObject({ kind: 'full-success' });
      expect(await churchAAccessOf(fixture.adminB)).toEqual([
        { role: 'admin' },
      ]);
      expect(await grantedMinistriesOf(fixture.adminB)).toEqual(
        [
          {
            ministryId: fixture.ministryOneA,
            ministryAccessLevel: 'volunteer',
          },
          { ministryId: fixture.ministryTwoA, ministryAccessLevel: 'leader' },
        ].sort((left, right) =>
          left.ministryId.localeCompare(right.ministryId),
        ),
      );
    });

    const staleChanges = [
      {
        change: 'a Ministry invitation is added',
        apply: async () => {
          await invitationManager.mint({
            churchId: ChurchId.from(fixture.churchA.id),
            ministryId: MinistryId.from(fixture.ministryTwoA),
            inviterId: UserId.from(fixture.adminA),
            email: `${fixture.adminB}@fixture.test`,
            ministryAccessLevel: 'leader',
            roleIds: [],
          });
        },
        reviewedHalves: 1,
      },
      {
        change: 'a Ministry invitation is revoked',
        apply: async (bundle: StaleBundle) => {
          await invitationManager.revoke({
            churchId: ChurchId.from(fixture.churchA.id),
            ministryId: MinistryId.from(fixture.ministryTwoA),
            ministryInvitationId: bundle.kidsId as never,
            callerId: UserId.from(fixture.adminA),
          });
        },
        reviewedHalves: 2,
      },
      {
        change: 'a Ministry invitation expires',
        apply: async (bundle: StaleBundle) => {
          await testDb
            .update(ministryInvitation)
            .set({ expiresAt: new Date(Date.now() - 60_000) })
            .where(eq(ministryInvitation.id, bundle.kidsId as string));
        },
        reviewedHalves: 2,
      },
      {
        change: 'the Church Access Level changes',
        apply: async () => {
          await invitationManager.mintAdmin({
            churchId: ChurchId.from(fixture.churchA.id),
            inviterId: UserId.from(fixture.adminA),
            email: `${fixture.adminB}@fixture.test`,
          });
        },
        reviewedHalves: 2,
      },
    ];

    it.each(
      staleChanges,
    )('refuses a stale review without any grant when $change, then accepts the refreshed offer', async ({
      apply,
      reviewedHalves,
    }) => {
      const email = `${fixture.adminB}@fixture.test`;
      const worship = await invitationManager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email,
        ministryAccessLevel: 'volunteer',
        roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
      });
      const kids =
        reviewedHalves === 2
          ? await invitationManager.mint({
              churchId: ChurchId.from(fixture.churchA.id),
              ministryId: MinistryId.from(fixture.ministryTwoA),
              inviterId: UserId.from(fixture.adminA),
              email,
              ministryAccessLevel: 'leader',
              roleIds: [],
            })
          : undefined;
      const cookie = await createSessionCookie({ userId: fixture.adminB });
      const stalePayload = await reviewedAcceptance({
        invitationId: worship.id,
        cookie,
      });

      await apply({ kidsId: kids?.id });
      const stale = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${worship.id}/accept`,
        headers: { cookie },
        payload: stalePayload,
      });

      expect(stale.json()).toEqual({ kind: 'offer-changed' });
      expect(await churchAAccessOf(fixture.adminB)).toEqual([]);
      expect(await grantedMinistriesOf(fixture.adminB)).toEqual([]);
      expect(await invitationStatusOf(worship.id)).toBe('pending');

      const fresh = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${worship.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: worship.id,
          cookie,
        }),
      });
      expect(fresh.json()).toMatchObject({ kind: 'full-success' });
      expect(await invitationStatusOf(worship.id)).toBe('accepted');
    });
  });

  describe('Volunteer Transfer routes', () => {
    async function mintTransferInvitation() {
      const [invitation] = await testDb
        .insert(ministryInvitation)
        .values({
          churchId: fixture.churchA.id,
          ministryId: fixture.ministryOneA,
          inviteeUserId: fixture.dualMemberAB,
          ministryAccessLevel: 'volunteer',
          inviterId: fixture.adminA,
          expiresAt: new Date('2026-12-01T00:00:00Z'),
        })
        .returning({ id: ministryInvitation.id });
      return invitation?.id ?? '';
    }

    it('GET /redemption/transfer/:invitationId/preview returns 401 without a session', async () => {
      const invitationId = await mintTransferInvitation();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/transfer/${invitationId}/preview`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /redemption/transfer/:invitationId/preview names both Churches and lists the real memberships', async () => {
      const invitationId = await mintTransferInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.dualMemberAB,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/transfer/${invitationId}/preview`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'reviewable',
        sourceChurchName: fixture.churchB.name,
        destinationChurchName: fixture.churchA.name,
        endedMemberships: [{ ministryName: expect.any(String) }],
      });
    });

    it('POST /redemption/transfer/:invitationId/confirm rejects a wrong password, issuing no session cookie', async () => {
      const invitationId = await mintTransferInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.dualMemberAB,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/transfer/${invitationId}/confirm`,
        headers: { cookie },
        payload: {
          destinationChurchName: fixture.churchA.name,
          password: 'not-the-real-password',
          idempotencyKey: crypto.randomUUID(),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: 'password-mismatch' });
      expect(response.headers['set-cookie']).toBeUndefined();
      // Nothing changed: the source profile is still active.
      const [profile] = await testDb
        .select({ leftAt: volunteer.leftAt })
        .from(volunteer)
        .where(eq(volunteer.id, fixture.dualMemberABVolunteerInB));
      expect(profile?.leftAt).toBeNull();
    });

    it('POST /redemption/transfer/:invitationId/confirm rejects a wrong destination name', async () => {
      const invitationId = await mintTransferInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.dualMemberAB,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/transfer/${invitationId}/confirm`,
        headers: { cookie },
        payload: {
          destinationChurchName: 'Some Other Church',
          password: 'not-the-real-password',
          idempotencyKey: crypto.randomUUID(),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: 'name-mismatch' });
    });

    it('on a correct password, completes the transfer and leaves no lingering session behind (spec §8.7: issues no new session)', async () => {
      const invitationId = await mintTransferInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.dualMemberAB,
      });
      await testDb.insert(account).values({
        id: crypto.randomUUID(),
        accountId: fixture.dualMemberAB,
        providerId: 'credential',
        userId: fixture.dualMemberAB,
        password: await hashPassword('correct horse battery staple'),
      });
      const sessionsBefore = await testDb
        .select()
        .from(session)
        .where(eq(session.userId, fixture.dualMemberAB));

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/transfer/${invitationId}/confirm`,
        headers: { cookie },
        payload: {
          destinationChurchName: fixture.churchA.name,
          password: 'correct horse battery staple',
          idempotencyKey: crypto.randomUUID(),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ kind: 'transferred' });
      expect(response.headers['set-cookie']).toBeUndefined();
      // The password check's own sign-in creates a session as a side effect;
      // it must be signed back out before this returns, leaving the session
      // table exactly as it was before the call (the raw test-harness
      // session used to authenticate the HTTP request itself, untouched).
      const sessionsAfter = await testDb
        .select()
        .from(session)
        .where(eq(session.userId, fixture.dualMemberAB));
      expect(sessionsAfter).toHaveLength(sessionsBefore.length);
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
        .select({
          status: ministryInvitation.status,
          declinedAt: ministryInvitation.declinedAt,
        })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitation.id));
      expect(declinedInvitation?.status).toBe('rejected');
      expect(declinedInvitation?.declinedAt).toBeInstanceOf(Date);
      const [audit] = await testDb
        .select()
        .from(identityAudit)
        .where(eq(identityAudit.ministryInvitationId, invitation.id));
      expect(audit).toMatchObject({
        action: 'decline',
        actorId: fixture.existingChurchMemberA,
      });
    });
  });

  describe('wrong login and ministry-only outcomes', () => {
    const addressedEmail = () =>
      `${fixture.existingChurchMemberA}@fixture.test`;

    async function countGrants() {
      const grants = await testDb
        .select()
        .from(ministryMembership)
        .where(eq(ministryMembership.ministryId, fixture.ministryOneA));
      return grants.length;
    }

    async function expectStillPending(invitationId: string) {
      const [row] = await testDb
        .select({ status: ministryInvitation.status })
        .from(ministryInvitation)
        .where(eq(ministryInvitation.id, invitationId));
      expect(row?.status).toBe('pending');
    }

    it('shows a wrong login only the masked addressed email and logs the mismatch', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.memberNoVolunteerA,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${invitation.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        kind: 'identity-mismatch',
        maskedEmail: 'f***@fixture.test',
      });
      expect(response.body).not.toContain(addressedEmail());
      const logged = await testDb
        .select()
        .from(securityLog)
        .where(eq(securityLog.ministryInvitationId, invitation.id));
      expect(logged).toHaveLength(1);
      expect(logged[0]?.event).toBe('identity_mismatch');
    });

    it('answers a signed-in person with no Church Membership the same masked notice, not 401', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createUserSession({
        email: 'nobody@elsewhere.test',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/redemption/ministry/${invitation.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ kind: 'identity-mismatch' });
    });

    it('grants nothing when a wrong login accepts', async () => {
      const invitation = await mintExistingMemberInvitation();
      const grantsBefore = await countGrants();
      const cookie = await createSessionCookie({
        userId: fixture.memberNoVolunteerA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.json()).toEqual({ kind: 'identity-mismatch' });
      expect(await countGrants()).toBe(grantsBefore);
      await expectStillPending(invitation.id);
    });

    it('declines nothing when a wrong login declines', async () => {
      const invitation = await mintExistingMemberInvitation();
      const grantsBefore = await countGrants();
      const cookie = await createSessionCookie({
        userId: fixture.memberNoVolunteerA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/decline`,
        headers: { cookie },
      });

      expect(response.json()).toEqual({ kind: 'identity-mismatch' });
      expect(await countGrants()).toBe(grantsBefore);
      await expectStillPending(invitation.id);
    });

    it('creates a Volunteer profile for a leader invitation with no Roles', async () => {
      const invitation = await invitationManager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: addressedEmail(),
        ministryAccessLevel: 'leader',
        roleIds: [],
      });
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.json()).toMatchObject({ kind: 'full-success' });
      const profiles = await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, fixture.existingChurchMemberA));
      expect(profiles).toHaveLength(1);
      const [grant] = await testDb
        .select({ level: ministryMembership.ministryAccessLevel })
        .from(ministryMembership)
        .where(eq(ministryMembership.ministryId, fixture.ministryOneA));
      expect(grant?.level).toBe('leader');
    });

    it('reuses the one active Volunteer for a zero-Role leader invitation', async () => {
      const [existingProfile] = await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, fixture.leaderOfMinistryTwoA));
      if (!existingProfile) throw new Error('Expected a Volunteer profile.');
      const invitation = await invitationManager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.leaderOfMinistryTwoA}@fixture.test`,
        ministryAccessLevel: 'leader',
        roleIds: [],
      });
      const cookie = await createSessionCookie({
        userId: fixture.leaderOfMinistryTwoA,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/accept`,
        headers: { cookie },
        payload: await reviewedAcceptance({
          invitationId: invitation.id,
          cookie: cookie,
        }),
      });

      expect(response.json()).toMatchObject({ kind: 'full-success' });
      const profiles = await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, fixture.leaderOfMinistryTwoA));
      expect(profiles.map((profile) => profile.id)).toEqual([
        existingProfile.id,
      ]);
      const [grant] = await testDb
        .select({ level: ministryMembership.ministryAccessLevel })
        .from(ministryMembership)
        .where(
          and(
            eq(ministryMembership.ministryId, fixture.ministryOneA),
            eq(ministryMembership.volunteerId, existingProfile.id),
          ),
        );
      expect(grant?.level).toBe('leader');
    });

    it('keeps Church Membership when the invitation is declined', async () => {
      const invitation = await mintExistingMemberInvitation();
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/redemption/ministry/${invitation.id}/decline`,
        headers: { cookie },
      });

      const memberships = await testDb
        .select()
        .from(member)
        .where(eq(member.userId, fixture.existingChurchMemberA));
      expect(memberships).toHaveLength(1);
    });
  });
});
