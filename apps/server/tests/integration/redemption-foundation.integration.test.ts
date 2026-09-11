import 'reflect-metadata';
import {
  identityAudit,
  invitationVerificationCode,
  ministryInvitation,
  ministryVolunteer,
  ministryVolunteerRole,
  outboxMessage,
  securityLog,
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
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../src/domain/branded-ids';
import type { RedemptionIdentityGateway } from '../../src/domain/contracts/infrastructure/redemption-identity-gateway';
import {
  DrizzleInvitationVerificationCodeRepository,
  DrizzleRedemptionRepository,
  DrizzleSecurityLogRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
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
  churchRepository,
  ministryInvitationRepository,
  ministryRepository,
  outboxRepository,
  roleRepository,
  volunteerRepository,
  volunteerTransferRepository,
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
  async rejectChurchInvitation() {
    throw new Error('Identity gateway is not used by checkpoint-three tests.');
  },
  async setActiveChurch() {
    throw new Error('Identity gateway is not used by checkpoint-three tests.');
  },
  async verifyPassword() {
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
      churchRepository,
      identityGateway: unusedIdentityGateway,
      invitationRepository: ministryInvitationRepository,
      invitationVerificationCodeManager: verificationCodeManager,
      redemptionRepository,
      securityLogRepository,
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
    volunteerRepository,
    volunteerTransferRepository,
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

interface MintMinistryOnlyInvitationInput {
  inviteeUserId: string;
  ministryAccessLevel?: 'volunteer' | 'leader';
  roleIds?: RoleId[];
}

/** Existing Church Members mint ministry-only, not chained — `mint` resolves this by email. */
async function mintMinistryOnlyInvitation({
  inviteeUserId,
  ministryAccessLevel = 'volunteer',
  roleIds = [],
}: MintMinistryOnlyInvitationInput) {
  return invitationManager.mint({
    churchId: ChurchId.from(fixture.churchA.id),
    ministryId: MinistryId.from(fixture.ministryOneA),
    inviterId: UserId.from(fixture.adminA),
    email: `${inviteeUserId}@fixture.test`,
    ministryAccessLevel,
    roleIds,
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

    // No `user` row exists for this id, so the Volunteer insert's FK to
    // `user.id` fails — the acceptance path only reuses an *existing* active
    // Volunteer profile for a real, already-volunteering User (idempotency,
    // covered above); it never fabricates one.
    await expect(
      redemptionManager.acceptPendingMinistryInvitation({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
        userId: UserId.from('99999999-9999-4999-8999-999999999999'),
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

describe('existing-member and lifecycle branches (#105)', () => {
  it('grants Ministry access to an existing Church Member and records a ministry_acceptance audit row', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
      ministryAccessLevel: 'volunteer',
      roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
    });
    const { redemptionManager } = createHarness();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const outcome = await redemptionManager.acceptExistingMember({
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.memberNoVolunteerA),
      sessionCookie: 'unused',
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      now,
    });

    expect(outcome.kind).toBe('full-success');
    const [membership] = await testDb
      .select({
        ministryAccessLevel: ministryVolunteer.ministryAccessLevel,
      })
      .from(ministryVolunteer)
      .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
      .where(
        and(
          eq(volunteer.userId, fixture.memberNoVolunteerA),
          eq(ministryVolunteer.ministryId, fixture.ministryOneA),
        ),
      );
    expect(membership?.ministryAccessLevel).toBe('volunteer');

    const audits = await testDb
      .select({
        action: identityAudit.action,
        actorId: identityAudit.actorId,
        correlationId: identityAudit.correlationId,
      })
      .from(identityAudit)
      .where(eq(identityAudit.ministryInvitationId, invitation.id));
    expect(audits).toEqual([
      {
        action: 'ministry_acceptance',
        actorId: fixture.memberNoVolunteerA,
        correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ]);
  });

  it('is idempotent when the invitee already holds Ministry access: tops up missing Roles without reducing existing access', async () => {
    // Mint while the invitee has no Ministry access yet — `mint` itself
    // refuses to create an invitation for someone already a member. Ministry
    // access then arrives through a separate path (e.g. a leader adding them
    // directly) while this invitation is still pending, which is the real
    // scenario spec §7.3's idempotent-acceptance branch guards against.
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
      ministryAccessLevel: 'leader',
      roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
    });
    const [existingVolunteer] = await testDb
      .insert(volunteer)
      .values({
        churchId: fixture.churchA.id,
        userId: fixture.memberNoVolunteerA,
      })
      .returning({ id: volunteer.id });
    if (!existingVolunteer) throw new Error('Volunteer insert failed');
    const [existingMembership] = await testDb
      .insert(ministryVolunteer)
      .values({
        churchId: fixture.churchA.id,
        ministryId: fixture.ministryOneA,
        volunteerId: existingVolunteer.id,
        ministryAccessLevel: 'volunteer',
      })
      .returning({ id: ministryVolunteer.id });
    if (!existingMembership)
      throw new Error('Ministry membership insert failed');

    const { redemptionManager } = createHarness();

    const outcome = await redemptionManager.acceptExistingMember({
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.memberNoVolunteerA),
      sessionCookie: 'unused',
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(outcome).toMatchObject({ kind: 'full-success' });
    const memberships = await testDb
      .select({
        id: ministryVolunteer.id,
        ministryAccessLevel: ministryVolunteer.ministryAccessLevel,
      })
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.volunteerId, existingVolunteer.id));
    expect(memberships).toEqual([
      { id: existingMembership.id, ministryAccessLevel: 'leader' },
    ]);
    const grantedRoles = await testDb
      .select({ roleId: ministryVolunteerRole.roleId })
      .from(ministryVolunteerRole)
      .where(
        eq(ministryVolunteerRole.ministryVolunteerId, existingMembership.id),
      );
    expect(grantedRoles).toEqual([{ roleId: fixture.roleInMinistryOneA }]);
    const allVolunteersForUser = await testDb
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(eq(volunteer.userId, fixture.memberNoVolunteerA));
    expect(allVolunteersForUser).toEqual([{ id: existingVolunteer.id }]);
  });

  it('reports identity-mismatch when the signed-in User does not match the invited Church Member', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
    });
    const { redemptionManager } = createHarness();

    const outcome = await redemptionManager.acceptExistingMember({
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.existingChurchMemberA),
      sessionCookie: 'unused',
      idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(outcome).toEqual({ kind: 'identity-mismatch' });
    const [storedInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    expect(storedInvitation?.status).toBe('pending');

    const securityLogRows = await testDb
      .select({
        event: securityLog.event,
        actorId: securityLog.actorId,
        ministryInvitationId: securityLog.ministryInvitationId,
        correlationId: securityLog.correlationId,
      })
      .from(securityLog)
      .where(eq(securityLog.ministryInvitationId, invitation.id));
    expect(securityLogRows).toEqual([
      {
        event: 'identity_mismatch',
        actorId: fixture.existingChurchMemberA,
        ministryInvitationId: invitation.id,
        // Threads the attempt's own idempotency key rather than minting a
        // fresh, disconnected correlation id.
        correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    ]);
    const identityAuditRows = await testDb
      .select({ id: identityAudit.id })
      .from(identityAudit)
      .where(eq(identityAudit.ministryInvitationId, invitation.id));
    expect(identityAuditRows).toEqual([]);
  });

  it('is a safe no-op retry of acceptPendingMinistryInvitation after it already committed', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
    });
    const { redemptionManager } = createHarness();
    const acceptInput = {
      churchId: ChurchId.from(fixture.churchA.id),
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.memberNoVolunteerA),
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
      correlationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      auditAction: 'ministry_acceptance' as const,
    };

    const firstVolunteerId =
      await redemptionManager.acceptPendingMinistryInvitation(acceptInput);
    const secondVolunteerId =
      await redemptionManager.acceptPendingMinistryInvitation(acceptInput);

    expect(secondVolunteerId).toBe(firstVolunteerId);
    const memberships = await testDb
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
      .where(eq(volunteer.userId, fixture.memberNoVolunteerA));
    expect(memberships).toHaveLength(1);
    const audits = await testDb
      .select({ id: identityAudit.id })
      .from(identityAudit)
      .where(eq(identityAudit.ministryInvitationId, invitation.id));
    expect(audits).toHaveLength(1);
  });

  it('offers Continue to Church for an already-accepted invitation instead of granting a second time', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
    });
    const { redemptionManager } = createHarness();
    const acceptInput = {
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.memberNoVolunteerA),
      sessionCookie: 'unused',
      idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      now: new Date('2026-01-01T00:00:00.000Z'),
    };
    await redemptionManager.acceptExistingMember(acceptInput);

    const outcome = await redemptionManager.acceptExistingMember({
      ...acceptInput,
      idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });

    expect(outcome).toEqual({
      kind: 'already-accepted',
      churchId: fixture.churchA.id,
    });
    const memberships = await testDb
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
      .where(
        and(
          eq(volunteer.userId, fixture.memberNoVolunteerA),
          eq(ministryVolunteer.ministryId, fixture.ministryOneA),
        ),
      );
    expect(memberships).toHaveLength(1);
  });

  it('declines a Ministry-only invitation, and a repeated decline is a safe no-op', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
    });
    const { redemptionManager } = createHarness();
    const declineInput = {
      ministryInvitationId: invitation.id,
      userId: UserId.from(fixture.memberNoVolunteerA),
      sessionCookie: 'unused',
    };

    const firstOutcome =
      await redemptionManager.declineInvitation(declineInput);
    expect(firstOutcome).toEqual({ kind: 'declined' });
    const [storedInvitation] = await testDb
      .select({ status: ministryInvitation.status })
      .from(ministryInvitation)
      .where(eq(ministryInvitation.id, invitation.id));
    expect(storedInvitation?.status).toBe('rejected');

    const secondOutcome =
      await redemptionManager.declineInvitation(declineInput);
    expect(secondOutcome).toEqual({ kind: 'declined' });

    const audits = await testDb
      .select({ action: identityAudit.action })
      .from(identityAudit)
      .where(eq(identityAudit.ministryInvitationId, invitation.id));
    expect(audits).toEqual([{ action: 'decline' }]);
  });

  it('classifies invitation status for the authenticated preview: redeemable and unavailable', async () => {
    const invitation = await mintMinistryOnlyInvitation({
      inviteeUserId: fixture.memberNoVolunteerA,
      roleIds: [RoleId.from(fixture.roleInMinistryOneA)],
    });
    const { redemptionManager } = createHarness();

    const redeemable = await redemptionManager.getAuthenticatedInvitationStatus(
      {
        ministryInvitationId: invitation.id,
        userId: UserId.from(fixture.memberNoVolunteerA),
      },
    );
    expect(redeemable).toMatchObject({
      kind: 'redeemable',
      ministryAccessLevel: 'volunteer',
      roleNames: [expect.any(String)],
    });

    const unavailable =
      await redemptionManager.getAuthenticatedInvitationStatus({
        ministryInvitationId: MinistryInvitationId.from(
          '00000000-0000-4000-8000-000000000000',
        ),
        userId: UserId.from(fixture.memberNoVolunteerA),
      });
    expect(unavailable).toEqual({ kind: 'unavailable' });
  });
});
