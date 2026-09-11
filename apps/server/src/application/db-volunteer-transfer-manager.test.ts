import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  UserId,
  VolunteerId,
} from '../domain/branded-ids';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionIdentityGateway } from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '../domain/contracts/infrastructure/security-log.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type {
  ExecuteVolunteerTransferOutcome,
  VolunteerTransferRepository,
} from '../domain/contracts/infrastructure/volunteer-transfer.repository';
import type { Church } from '../domain/entities/church';
import { MinistryInvitation } from '../domain/entities/ministry-invitation';
import type { Volunteer } from '../domain/entities/volunteer';
import { DbVolunteerTransferManager } from './db-volunteer-transfer-manager';

const DESTINATION_CHURCH_ID = ChurchId.from(
  '11111111-1111-4111-8111-111111111111',
);
const SOURCE_CHURCH_ID = ChurchId.from('22222222-2222-4222-8222-222222222222');
const MINISTRY_INVITATION_ID = MinistryInvitationId.from(
  '33333333-3333-4333-8333-333333333333',
);
const USER_ID = UserId.from('44444444-4444-4444-8444-444444444444');
const DESTINATION_VOLUNTEER_ID = VolunteerId.from(
  '55555555-5555-4555-8555-555555555555',
);
const DESTINATION_CHURCH_NAME = 'Northgate Community Church';
const IDEMPOTENCY_KEY = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-09-15T12:00:00.000Z');

function pendingInvitation(): MinistryInvitation {
  return new MinistryInvitation(
    {
      churchId: DESTINATION_CHURCH_ID,
      ministryId: MinistryId.from('77777777-7777-4777-8777-777777777777'),
      inviteeUserId: USER_ID,
      ministryAccessLevel: 'volunteer',
      status: 'pending',
      inviterId: UserId.from('88888888-8888-4888-8888-888888888888'),
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      roleIds: [],
    },
    MINISTRY_INVITATION_ID,
  );
}

interface HarnessOverrides {
  addressed?: boolean;
  activeProfileChurchId?: ChurchId | null;
  passwordValid?: boolean;
  executeOutcome?: ExecuteVolunteerTransferOutcome;
  invitation?: MinistryInvitation | null;
}

function createHarness(overrides: HarnessOverrides = {}) {
  const {
    addressed = true,
    activeProfileChurchId = SOURCE_CHURCH_ID,
    passwordValid = true,
    executeOutcome = {
      kind: 'transferred',
      result: {
        volunteerTransferId: VolunteerId.from(
          '99999999-9999-4999-8999-999999999999',
        ) as never,
        sourceVolunteerId: VolunteerId.from(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        destinationVolunteerId: DESTINATION_VOLUNTEER_ID,
        withdrawnAssignmentCount: 2,
        endedMembershipCount: 1,
      },
    },
    invitation = pendingInvitation(),
  } = overrides;

  const invitationRepository = {
    findMinistryInvitationContext: vi.fn().mockResolvedValue(
      invitation
        ? {
            ministryInvitation: invitation,
            email: 'dual@example.test',
            churchName: DESTINATION_CHURCH_NAME,
            ministryName: 'Worship',
            roleNames: [],
          }
        : null,
    ),
    isInvitationAddressedToUser: vi.fn().mockResolvedValue(addressed),
  } as unknown as MinistryInvitationRepository;

  const volunteerRepository = {
    findByUserIdGlobally: vi
      .fn()
      .mockResolvedValue(
        activeProfileChurchId
          ? ({ id: 'vol-b', churchId: activeProfileChurchId } as Volunteer)
          : null,
      ),
  } as unknown as VolunteerRepository;

  const identityGateway = {
    verifyPassword: vi.fn().mockResolvedValue(passwordValid),
  } as unknown as RedemptionIdentityGateway;

  const churchRepository = {
    getById: vi
      .fn()
      .mockResolvedValue({ name: 'Riverside Fellowship' } as Church),
    getBySlug: vi.fn(),
    listAdminEmails: vi.fn(),
  } as ChurchRepository;

  const securityLogRepository: SecurityLogRepository = {
    recordIdentityMismatch: vi.fn().mockResolvedValue(undefined),
  };

  const volunteerTransferRepository = {
    getTransferImpact: vi.fn().mockResolvedValue({
      endedMemberships: [{ ministryName: 'Hospitality' }],
      withdrawnAssignments: [
        {
          eventName: 'Transfer Sunday',
          timeSlotStart: new Date('2026-09-20T09:00:00Z'),
          roleName: 'Greeter',
        },
      ],
    }),
    executeTransfer: vi.fn().mockResolvedValue(executeOutcome),
  } as unknown as VolunteerTransferRepository;

  const unitOfWork: UnitOfWork = {
    async run(fn) {
      return fn({} as TransactionContext);
    },
  };

  const manager = new DbVolunteerTransferManager({
    churchRepository,
    identityGateway,
    invitationRepository,
    securityLogRepository,
    unitOfWork,
    volunteerRepository,
    volunteerTransferRepository,
  });

  return {
    manager,
    identityGateway,
    securityLogRepository,
    volunteerTransferRepository,
  };
}

const confirmInput = {
  ministryInvitationId: MINISTRY_INVITATION_ID,
  userId: USER_ID,
  destinationChurchName: DESTINATION_CHURCH_NAME,
  password: 'correct-horse-battery-staple',
  idempotencyKey: IDEMPOTENCY_KEY,
  now: NOW,
};

describe('DbVolunteerTransferManager', () => {
  describe('getTransferPreview', () => {
    it('returns the reviewable impact naming both Churches', async () => {
      const { manager } = createHarness();

      const preview = await manager.getTransferPreview({
        ministryInvitationId: MINISTRY_INVITATION_ID,
        userId: USER_ID,
        now: NOW,
      });

      expect(preview).toEqual({
        kind: 'reviewable',
        sourceChurchName: 'Riverside Fellowship',
        destinationChurchName: DESTINATION_CHURCH_NAME,
        endedMemberships: [{ ministryName: 'Hospitality' }],
        withdrawnAssignments: [
          {
            eventName: 'Transfer Sunday',
            timeSlotStart: new Date('2026-09-20T09:00:00Z'),
            roleName: 'Greeter',
          },
        ],
      });
    });

    it('reports no-transfer-needed when there is no active profile elsewhere', async () => {
      const { manager } = createHarness({ activeProfileChurchId: null });

      await expect(
        manager.getTransferPreview({
          ministryInvitationId: MINISTRY_INVITATION_ID,
          userId: USER_ID,
          now: NOW,
        }),
      ).resolves.toEqual({ kind: 'no-transfer-needed' });
    });
  });

  describe('confirmTransfer', () => {
    it('rejects a wrong destination name without running the transaction', async () => {
      const { manager, securityLogRepository, volunteerTransferRepository } =
        createHarness();

      const outcome = await manager.confirmTransfer({
        ...confirmInput,
        destinationChurchName: 'Not The Church',
      });

      expect(outcome).toEqual({ kind: 'name-mismatch' });
      expect(
        volunteerTransferRepository.executeTransfer,
      ).not.toHaveBeenCalled();
      expect(
        securityLogRepository.recordIdentityMismatch,
      ).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong password without running the transaction', async () => {
      const { manager, securityLogRepository, volunteerTransferRepository } =
        createHarness({ passwordValid: false });

      const outcome = await manager.confirmTransfer(confirmInput);

      expect(outcome).toEqual({ kind: 'password-mismatch' });
      expect(
        volunteerTransferRepository.executeTransfer,
      ).not.toHaveBeenCalled();
      expect(
        securityLogRepository.recordIdentityMismatch,
      ).toHaveBeenCalledTimes(1);
    });

    it('threads all three layers and returns the destination Volunteer id', async () => {
      const { manager, identityGateway, volunteerTransferRepository } =
        createHarness();

      const outcome = await manager.confirmTransfer(confirmInput);

      expect(outcome).toEqual({
        kind: 'transferred',
        destinationVolunteerId: DESTINATION_VOLUNTEER_ID,
      });
      expect(identityGateway.verifyPassword).toHaveBeenCalledWith({
        email: 'dual@example.test',
        password: 'correct-horse-battery-staple',
      });
      expect(volunteerTransferRepository.executeTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          ministryInvitationId: MINISTRY_INVITATION_ID,
          sourceChurchId: SOURCE_CHURCH_ID,
          destinationChurchId: DESTINATION_CHURCH_ID,
          confirmedAt: NOW,
          correlationId: IDEMPOTENCY_KEY,
        }),
      );
    });

    it('passes an idempotent replay straight through', async () => {
      const { manager } = createHarness({
        executeOutcome: {
          kind: 'already-transferred',
          result: {
            volunteerTransferId: VolunteerId.from(
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            ) as never,
            sourceVolunteerId: VolunteerId.from(
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            ),
            destinationVolunteerId: DESTINATION_VOLUNTEER_ID,
            withdrawnAssignmentCount: 2,
            endedMembershipCount: 1,
          },
        },
      });

      await expect(manager.confirmTransfer(confirmInput)).resolves.toEqual({
        kind: 'already-transferred',
        destinationVolunteerId: DESTINATION_VOLUNTEER_ID,
      });
    });

    it('is an identity mismatch when the invitation is not addressed to the caller', async () => {
      const { manager } = createHarness({ addressed: false });

      await expect(manager.confirmTransfer(confirmInput)).resolves.toEqual({
        kind: 'identity-mismatch',
      });
    });

    it('is a terminal NO_TRANSFER_NEEDED failure when nothing is transferable', async () => {
      const { manager } = createHarness({ activeProfileChurchId: null });

      await expect(manager.confirmTransfer(confirmInput)).resolves.toEqual({
        kind: 'terminal-failure',
        reason: 'NO_TRANSFER_NEEDED',
      });
    });

    it('is a terminal INVITATION_UNAVAILABLE failure when the transaction reports one', async () => {
      const { manager } = createHarness({
        executeOutcome: {
          kind: 'terminal-failure',
          reason: 'INVITATION_UNAVAILABLE',
        },
      });

      await expect(manager.confirmTransfer(confirmInput)).resolves.toEqual({
        kind: 'terminal-failure',
        reason: 'INVITATION_UNAVAILABLE',
      });
    });
  });
});
