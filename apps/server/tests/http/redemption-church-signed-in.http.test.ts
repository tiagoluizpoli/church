import { appConfig } from '@church/app-config';
import {
  invitation as churchInvitation,
  member,
  ministryMembership,
  securityLog,
  session,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import { env } from '@church/env/server';
import { makeSignature } from 'better-auth/crypto';
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
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
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

type InvitedLevel = 'member' | 'admin';

interface InviteBrunoInput {
  churchAccessLevel: InvitedLevel;
}

/** Bruno is a Church Member of Church A; Church B invites his email, Church only. */
function brunoEmail(): string {
  return `${fixture.existingChurchMemberA}@fixture.test`;
}

async function inviteBrunoToChurchB({
  churchAccessLevel,
}: InviteBrunoInput): Promise<string> {
  if (churchAccessLevel === 'admin') {
    const minted = await invitationManager.mintAdmin({
      churchId: ChurchId.from(fixture.churchB.id),
      inviterId: UserId.from(fixture.adminB),
      email: brunoEmail(),
    });
    return minted.churchInvitationId;
  }
  // A plain member offer: what the provisioning script or a lone Church half leaves.
  const created = await unitOfWork.run((tx) =>
    ministryInvitationRepository.createChurchInvitation({
      churchId: ChurchId.from(fixture.churchB.id),
      email: brunoEmail(),
      inviterId: UserId.from(fixture.adminB),
      churchAccessLevel: 'member',
      tx,
    }),
  );
  return created.id;
}

interface InvitationRequestInput {
  invitationId: string;
  cookie?: string;
}

function readStatus({ invitationId, cookie }: InvitationRequestInput) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/redemption/church/${invitationId}/review`,
    headers: cookie ? { cookie } : {},
  });
}

interface AcceptInput extends InvitationRequestInput {
  reviewToken: string;
}

function accept({ invitationId, cookie, reviewToken }: AcceptInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/redemption/church/${invitationId}/accept`,
    headers: cookie ? { cookie } : {},
    payload: { idempotencyKey: crypto.randomUUID(), reviewToken },
  });
}

interface MembershipsOfInput {
  userId: string;
  churchId: string;
}

function membershipsOf({ userId, churchId }: MembershipsOfInput) {
  return testDb
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, churchId)));
}

async function activeChurchOf(cookie: string): Promise<string | null> {
  const token = cookie.split('=')[1]?.split('.')[0] ?? '';
  const [row] = await testDb
    .select({ activeChurchId: session.activeOrganizationId })
    .from(session)
    .where(eq(session.token, token));
  return row?.activeChurchId ?? null;
}

async function churchInvitationStatusOf(id: string): Promise<string> {
  const [row] = await testDb
    .select({ status: churchInvitation.status })
    .from(churchInvitation)
    .where(eq(churchInvitation.id, id));
  return row?.status ?? '';
}

/** Church B's admin pairs a Ministry Invitation onto Bruno's pending offer. */
function pairMinistryInvitation() {
  return invitationManager.mint({
    churchId: ChurchId.from(fixture.churchB.id),
    ministryId: MinistryId.from(fixture.ministryInB),
    inviterId: UserId.from(fixture.adminB),
    email: brunoEmail(),
    ministryAccessLevel: 'volunteer',
    roleIds: [RoleId.from(fixture.roleInMinistryInB)],
  });
}

function mismatchesLoggedFor(actorId: string) {
  return testDb
    .select({
      event: securityLog.event,
      churchId: securityLog.churchId,
      ministryInvitationId: securityLog.ministryInvitationId,
    })
    .from(securityLog)
    .where(eq(securityLog.actorId, actorId));
}

describe('Signed-in Church-only acceptance HTTP boundary', () => {
  it.each([
    'member',
    'admin',
  ] as const)("Bruno, a Church A member, joins Church B at '%s' with Church B active and Church A untouched", async (churchAccessLevel) => {
    const invitationId = await inviteBrunoToChurchB({ churchAccessLevel });
    const cookie = await createSessionCookie({
      userId: fixture.existingChurchMemberA,
    });
    const ministryMembershipsBefore = await testDb
      .select()
      .from(ministryMembership);

    const status = await readStatus({ invitationId, cookie });

    expect(status.statusCode).toBe(200);
    const reviewed = status.json();
    expect(reviewed).toEqual({
      kind: 'redeemable',
      churchName: fixture.churchB.name,
      email: brunoEmail(),
      churchAccessLevel,
      expiresAt: expect.any(String),
      reviewToken: expect.any(String),
    });

    const accepted = await accept({
      invitationId,
      cookie,
      reviewToken: reviewed.reviewToken,
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({
      kind: 'full-success',
      churchId: fixture.churchB.id,
    });
    expect(
      await membershipsOf({
        userId: fixture.existingChurchMemberA,
        churchId: fixture.churchB.id,
      }),
    ).toEqual([{ role: churchAccessLevel }]);
    expect(
      await membershipsOf({
        userId: fixture.existingChurchMemberA,
        churchId: fixture.churchA.id,
      }),
    ).toEqual([{ role: 'member' }]);
    expect(await activeChurchOf(cookie)).toBe(fixture.churchB.id);
    expect(await churchInvitationStatusOf(invitationId)).toBe('accepted');
    // A plain Church Invitation creates no Volunteer side effects.
    expect(
      await testDb
        .select()
        .from(volunteer)
        .where(eq(volunteer.userId, fixture.existingChurchMemberA)),
    ).toEqual([]);
    expect(await testDb.select().from(ministryMembership)).toEqual(
      ministryMembershipsBefore,
    );
    expect(await testDb.select().from(volunteerTransfer)).toEqual([]);
  });

  it('answers paired with the oldest pending half, whose Ministry review and accept work as before', async () => {
    const invitationId = await inviteBrunoToChurchB({
      churchAccessLevel: 'member',
    });
    const half = await pairMinistryInvitation();
    expect(half.churchInvitationId).toBe(invitationId);
    const cookie = await createSessionCookie({
      userId: fixture.existingChurchMemberA,
    });

    const status = await readStatus({ invitationId, cookie });

    expect(status.json()).toEqual({
      kind: 'paired',
      ministryInvitationId: half.id,
    });
    const ministryStatus = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/ministry/${half.id}`,
      headers: { cookie },
    });
    expect(ministryStatus.json()).toMatchObject({
      kind: 'redeemable',
      invitationKind: 'chained',
      churchAccessLevel: 'member',
    });
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/redemption/ministry/${half.id}/accept`,
      headers: { cookie },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        reviewToken: ministryStatus.json().reviewToken,
      },
    });
    expect(accepted.json()).toMatchObject({ kind: 'full-success' });
    expect(
      await membershipsOf({
        userId: fixture.existingChurchMemberA,
        churchId: fixture.churchB.id,
      }),
    ).toEqual([{ role: 'member' }]);
  });

  describe('signed in with another email', () => {
    it('reads identity-mismatch with the masked email and logs it', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'member',
      });
      const cookie = await createSessionCookie({
        userId: fixture.memberNoVolunteerA,
      });

      const status = await readStatus({ invitationId, cookie });

      expect(status.json()).toEqual({
        kind: 'identity-mismatch',
        maskedEmail: 'f***@fixture.test',
      });
      expect(status.body).not.toContain(brunoEmail());
      expect(await mismatchesLoggedFor(fixture.memberNoVolunteerA)).toEqual([
        {
          event: 'identity_mismatch',
          churchId: fixture.churchB.id,
          ministryInvitationId: null,
        },
      ]);
    });

    it('accepts nothing, answers identity-mismatch with the masked email and logs it', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'member',
      });
      const brunoCookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });
      const { reviewToken } = (
        await readStatus({ invitationId, cookie: brunoCookie })
      ).json();
      const cookie = await createSessionCookie({
        userId: fixture.memberNoVolunteerA,
      });

      const accepted = await accept({ invitationId, cookie, reviewToken });

      expect(accepted.json()).toEqual({
        kind: 'identity-mismatch',
        maskedEmail: 'f***@fixture.test',
      });
      expect(
        await mismatchesLoggedFor(fixture.memberNoVolunteerA),
      ).toHaveLength(1);
      expect(await churchInvitationStatusOf(invitationId)).toBe('pending');
      expect(
        await membershipsOf({
          userId: fixture.memberNoVolunteerA,
          churchId: fixture.churchB.id,
        }),
      ).toEqual([]);
    });
  });

  describe('offer changed between review and accept', () => {
    interface ExpectOfferChangedInput {
      invitationId: string;
      cookie: string;
      reviewToken: string;
    }

    async function expectNothingGranted({
      invitationId,
      cookie,
      reviewToken,
    }: ExpectOfferChangedInput) {
      const accepted = await accept({ invitationId, cookie, reviewToken });
      expect(accepted.json()).toEqual({ kind: 'offer-changed' });
      expect(await churchInvitationStatusOf(invitationId)).toBe('pending');
      expect(
        await membershipsOf({
          userId: fixture.existingChurchMemberA,
          churchId: fixture.churchB.id,
        }),
      ).toEqual([]);
    }

    async function reviewAsBruno(invitationId: string) {
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });
      const status = await readStatus({ invitationId, cookie });
      return { cookie, reviewToken: status.json().reviewToken as string };
    }

    it('grants nothing after a member → admin raise; a fresh status gives a new token', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'member',
      });
      const { cookie, reviewToken } = await reviewAsBruno(invitationId);
      const raised = await invitationManager.mintAdmin({
        churchId: ChurchId.from(fixture.churchB.id),
        inviterId: UserId.from(fixture.adminB),
        email: brunoEmail(),
      });
      expect(raised.outcome).toBe('upgraded');

      await expectNothingGranted({ invitationId, cookie, reviewToken });

      const fresh = (await readStatus({ invitationId, cookie })).json();
      expect(fresh).toMatchObject({
        kind: 'redeemable',
        churchAccessLevel: 'admin',
      });
      expect(fresh.reviewToken).not.toBe(reviewToken);
    });

    it('grants nothing after a Ministry Invitation is paired onto it; a fresh status answers paired', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'member',
      });
      const { cookie, reviewToken } = await reviewAsBruno(invitationId);
      const half = await pairMinistryInvitation();

      await expectNothingGranted({ invitationId, cookie, reviewToken });

      expect((await readStatus({ invitationId, cookie })).json()).toEqual({
        kind: 'paired',
        ministryInvitationId: half.id,
      });
    });

    it('grants nothing after a resend extends the expiry; a fresh status gives a new token', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'admin',
      });
      const { cookie, reviewToken } = await reviewAsBruno(invitationId);
      const resent = await invitationManager.resendChurch({
        churchId: ChurchId.from(fixture.churchB.id),
        churchInvitationId: invitationId,
      });
      expect(resent).not.toBeNull();

      await expectNothingGranted({ invitationId, cookie, reviewToken });

      const fresh = (await readStatus({ invitationId, cookie })).json();
      expect(fresh).toMatchObject({ kind: 'redeemable' });
      expect(fresh.reviewToken).not.toBe(reviewToken);
    });
  });

  describe.each([
    'revoked',
    'expired',
  ] as const)('a %s Church Invitation', (lifecycle) => {
    async function makeUnusable(invitationId: string) {
      if (lifecycle === 'revoked') {
        await invitationManager.revokeChurch({
          churchId: ChurchId.from(fixture.churchB.id),
          churchInvitationId: invitationId,
          callerId: UserId.from(fixture.adminB),
        });
        return;
      }
      await testDb
        .update(churchInvitation)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(churchInvitation.id, invitationId));
    }

    it('reads unavailable and refuses accept with INVITATION_UNAVAILABLE', async () => {
      const invitationId = await inviteBrunoToChurchB({
        churchAccessLevel: 'admin',
      });
      const cookie = await createSessionCookie({
        userId: fixture.existingChurchMemberA,
      });
      const { reviewToken } = (
        await readStatus({ invitationId, cookie })
      ).json();
      await makeUnusable(invitationId);

      expect((await readStatus({ invitationId, cookie })).json()).toEqual({
        kind: 'unavailable',
      });
      expect(
        (await accept({ invitationId, cookie, reviewToken })).json(),
      ).toEqual({
        kind: 'terminal-failure',
        reason: 'INVITATION_UNAVAILABLE',
      });
      expect(
        await membershipsOf({
          userId: fixture.existingChurchMemberA,
          churchId: fixture.churchB.id,
        }),
      ).toEqual([]);
    });
  });

  it('answers a second accept with already-accepted, keeping one Church Membership', async () => {
    const invitationId = await inviteBrunoToChurchB({
      churchAccessLevel: 'member',
    });
    const cookie = await createSessionCookie({
      userId: fixture.existingChurchMemberA,
    });
    const { reviewToken } = (await readStatus({ invitationId, cookie })).json();
    await accept({ invitationId, cookie, reviewToken });

    const again = await accept({ invitationId, cookie, reviewToken });

    expect(again.json()).toEqual({
      kind: 'already-accepted',
      churchId: fixture.churchB.id,
    });
    expect((await readStatus({ invitationId, cookie })).json()).toEqual({
      kind: 'already-accepted',
      churchId: fixture.churchB.id,
    });
    expect(
      await membershipsOf({
        userId: fixture.existingChurchMemberA,
        churchId: fixture.churchB.id,
      }),
    ).toEqual([{ role: 'member' }]);
  });

  it('answers 401 on both endpoints without a session', async () => {
    const invitationId = await inviteBrunoToChurchB({
      churchAccessLevel: 'member',
    });

    expect((await readStatus({ invitationId })).statusCode).toBe(401);
    expect(
      (await accept({ invitationId, reviewToken: 'never-reviewed' }))
        .statusCode,
    ).toBe(401);
    expect(await churchInvitationStatusOf(invitationId)).toBe('pending');
  });
});
