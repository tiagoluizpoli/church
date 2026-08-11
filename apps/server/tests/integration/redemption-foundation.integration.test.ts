import 'reflect-metadata';
import {
  invitationVerificationCode,
  ministryInvitation,
  ministryVolunteer,
  ministryVolunteerRole,
  outboxMessage,
  volunteer,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbOutboxDrainer } from '../../src/application/db-outbox-drainer';
import { DbRedemptionManager } from '../../src/application/db-redemption-manager';
import { InvitationVerificationCodeManager } from '../../src/application/invitation-verification-code-manager';
import {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
} from '../../src/domain/branded-ids';
import type { RedemptionIdentityGateway } from '../../src/domain/contracts/infrastructure/redemption-identity-gateway';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleUnitOfWork,
} from '../../src/infrastructure/repositories';
import { CaptureEmailSender } from '../../src/infrastructure/services/capture-email-sender';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from './repositories/setup';

const verificationCodeRepository =
  new DrizzleInvitationVerificationCodeRepository({ db: testDb });
const redemptionRepository = new DrizzleRedemptionRepository({ db: testDb });
const unitOfWork = new DrizzleUnitOfWork({ db: testDb });
const {
  manager: invitationManager,
  churchRepository,
  ministryInvitationRepository,
  ministryRepository,
  outboxRepository,
  roleRepository,
} = createMinistryInvitationTestHarness({ db: testDb });

interface RedemptionHarness {
  verificationCodeManager: InvitationVerificationCodeManager;
  redemptionManager: DbRedemptionManager;
}

const unusedIdentityGateway: RedemptionIdentityGateway = {
  async createAccount() {
    throw new Error('Identity gateway is not used by checkpoint-three tests.');
  },
  async acceptChurchInvitation() {
    throw new Error('Identity gateway is not used by checkpoint-three tests.');
  },
  async setActiveChurch() {
    throw new Error('Identity gateway is not used by checkpoint-three tests.');
  },
};

function createHarness(): RedemptionHarness {
  const verificationCodeManager = new InvitationVerificationCodeManager({
    repository: verificationCodeRepository,
    emailSender: new CaptureEmailSender(),
    generateCode: () => '123456',
    verificationCodeSecret: 'test-secret',
  });
  return {
    verificationCodeManager,
    redemptionManager: new DbRedemptionManager({
      identityGateway: unusedIdentityGateway,
      invitationRepository: ministryInvitationRepository,
      invitationVerificationCodeManager: verificationCodeManager,
      redemptionRepository,
      unitOfWork,
    }),
  };
}

interface CreateOutboxDrainerInput {
  emailSender: CaptureEmailSender;
}

function createOutboxDrainer({
  emailSender,
}: CreateOutboxDrainerInput): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository,
    invitationRepository: ministryInvitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    emailSender,
    unitOfWork,
  });
}

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

async function mintInvitation() {
  return invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: 'new-redemption-user@fixture.test',
    ministryAccessLevel: 'leader',
    roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
  });
}

describe('verification code persistence', () => {
  it('allows only one concurrent correct submission to consume a code', async () => {
    const invitation = await mintInvitation();
    const { verificationCodeManager } = createHarness();
    const now = new Date('2026-01-01T00:00:00.000Z');
    await verificationCodeManager.issue({
      ministryInvitationId: invitation.id,
      recipientEmail: 'new-redemption-user@fixture.test',
      churchName: fixture.churchA.name,
      now,
    });

    const outcomes = await Promise.allSettled([
      verificationCodeManager.verify({
        ministryInvitationId: invitation.id,
        code: '123456',
        now,
      }),
      verificationCodeManager.verify({
        ministryInvitationId: invitation.id,
        code: '123456',
        now,
      }),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('resumes only the redemption request that consumed the code', async () => {
    const invitation = await mintInvitation();
    const { verificationCodeManager } = createHarness();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const idempotencyKey = '11111111-1111-4111-8111-111111111111';
    await verificationCodeManager.issue({
      ministryInvitationId: invitation.id,
      recipientEmail: 'new-redemption-user@fixture.test',
      churchName: fixture.churchA.name,
      now,
    });

    await verificationCodeManager.verify({
      ministryInvitationId: invitation.id,
      code: '123456',
      idempotencyKey,
      now,
    });
    await expect(
      verificationCodeManager.verify({
        ministryInvitationId: invitation.id,
        code: '123456',
        idempotencyKey,
        now,
      }),
    ).resolves.toBeUndefined();
    await expect(
      verificationCodeManager.verify({
        ministryInvitationId: invitation.id,
        code: '123456',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        now,
      }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_CODE_CONSUMED' });
  });

  it('never increments past five failed attempts under concurrent invalid submissions', async () => {
    const invitation = await mintInvitation();
    const { verificationCodeManager } = createHarness();
    const now = new Date('2026-01-01T00:00:00.000Z');
    await verificationCodeManager.issue({
      ministryInvitationId: invitation.id,
      recipientEmail: 'new-redemption-user@fixture.test',
      churchName: fixture.churchA.name,
      now,
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        verificationCodeManager.verify({
          ministryInvitationId: invitation.id,
          code: '000000',
          now,
        }),
      ),
    );
    const [stored] = await testDb
      .select({ failedAttempts: invitationVerificationCode.failedAttempts })
      .from(invitationVerificationCode)
      .where(
        eq(invitationVerificationCode.ministryInvitationId, invitation.id),
      );

    expect(outcomes).toHaveLength(12);
    expect(stored?.failedAttempts).toBe(5);
  });

  it('allows only one concurrent resend claim and dispatch', async () => {
    const invitation = await mintInvitation();
    const emailSenderA = new CaptureEmailSender();
    const emailSenderB = new CaptureEmailSender();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const managerA = new InvitationVerificationCodeManager({
      repository: verificationCodeRepository,
      emailSender: emailSenderA,
      generateCode: () => '123456',
      verificationCodeSecret: 'test-secret',
    });
    const managerB = new InvitationVerificationCodeManager({
      repository: verificationCodeRepository,
      emailSender: emailSenderB,
      generateCode: () => '123456',
      verificationCodeSecret: 'test-secret',
    });

    const outcomes = await Promise.allSettled([
      managerA.issue({
        ministryInvitationId: invitation.id,
        recipientEmail: 'new-redemption-user@fixture.test',
        churchName: fixture.churchA.name,
        now,
      }),
      managerB.issue({
        ministryInvitationId: invitation.id,
        recipientEmail: 'new-redemption-user@fixture.test',
        churchName: fixture.churchA.name,
        now,
      }),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(emailSenderA.sent.length + emailSenderB.sent.length).toBe(1);
  });
});

describe('checkpoint-three redemption persistence', () => {
  it('derives Ministry access and roles from the pending invitation in one transaction', async () => {
    const invitation = await mintInvitation();
    await createOutboxDrainer({
      emailSender: new CaptureEmailSender(),
    }).drainOnce({ limit: 10 });
    const { redemptionManager } = createHarness();

    const correlationId = '11111111-1111-4111-8111-111111111111';
    const volunteerId = await redemptionManager.acceptPendingMinistryInvitation(
      {
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
        userId: UserId.from(fixture.memberNoVolunteerA),
        acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
        correlationId,
      },
    );
    const [membership] = await testDb
      .select()
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.volunteerId, volunteerId));
    const grantedRoles = await testDb
      .select({ roleId: ministryVolunteerRole.roleId })
      .from(ministryVolunteerRole)
      .where(
        eq(ministryVolunteerRole.ministryVolunteerId, membership?.id ?? ''),
      );

    expect(membership?.ministryId).toBe(fixture.ministryOneA);
    expect(membership?.ministryAccessLevel).toBe('leader');
    expect(grantedRoles).toEqual([{ roleId: fixture.roleInMinistryOneA }]);
    const redemptionOutbox = await testDb
      .select({
        correlationId: outboxMessage.correlationId,
        kind: outboxMessage.kind,
        payload: outboxMessage.payload,
      })
      .from(outboxMessage)
      .where(eq(outboxMessage.kind, 'redemption.accepted'));
    expect(redemptionOutbox).toEqual([
      {
        correlationId,
        kind: 'redemption.accepted',
        payload: {
          ministryInvitationId: invitation.id,
          volunteerId,
        },
      },
    ]);
    const emailSender = new CaptureEmailSender();
    await expect(
      createOutboxDrainer({ emailSender }).drainOnce({ limit: 10 }),
    ).resolves.toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.sent).toEqual([
      expect.objectContaining({
        kind: 'redemption.accepted',
        churchName: fixture.churchA.name,
        ministryName: expect.stringContaining('Worship'),
      }),
    ]);
  });

  it('rejects expired and cross-Church acceptance without partial grants', async () => {
    const invitation = await mintInvitation();
    const { redemptionManager } = createHarness();
    const expiredAt = new Date('2026-01-01T00:00:00.000Z');
    await testDb
      .update(ministryInvitation)
      .set({ expiresAt: new Date(expiredAt.getTime() - 1) })
      .where(eq(ministryInvitation.id, invitation.id));

    await expect(
      redemptionManager.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(fixture.churchB.id),
        ministryInvitationId: invitation.id,
        userId: UserId.from(fixture.memberNoVolunteerA),
        acceptedAt: expiredAt,
      }),
    ).rejects.toThrow('Pending ministry invitation not found');

    await expect(
      redemptionManager.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
        userId: UserId.from(fixture.memberNoVolunteerA),
        acceptedAt: expiredAt,
      }),
    ).rejects.toThrow('Pending ministry invitation not found');

    const grants = await testDb
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.churchId, fixture.churchA.id),
          eq(volunteer.userId, fixture.memberNoVolunteerA),
        ),
      );
    expect(grants).toHaveLength(0);
  });

  it('rolls back every grant when checkpoint three cannot create the Volunteer', async () => {
    const invitation = await mintInvitation();
    const { redemptionManager } = createHarness();
    const existingMemberships = await testDb
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.churchId, fixture.churchA.id),
          eq(ministryVolunteer.ministryId, fixture.ministryOneA),
        ),
      );

    await expect(
      redemptionManager.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
        userId: UserId.from(fixture.leaderOfMinistryOneA),
        acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow();

    const [storedInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    const acceptedMemberships = await testDb
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .where(
        and(
          eq(ministryVolunteer.churchId, fixture.churchA.id),
          eq(ministryVolunteer.ministryId, fixture.ministryOneA),
        ),
      );
    const redemptionOutbox = await testDb
      .select({ id: outboxMessage.id })
      .from(outboxMessage)
      .where(eq(outboxMessage.kind, 'redemption.accepted'));

    expect(storedInvitation?.status).toBe('pending');
    expect(acceptedMemberships).toEqual(existingMemberships);
    expect(redemptionOutbox).toEqual([]);
  });
});
