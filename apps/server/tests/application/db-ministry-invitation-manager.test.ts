import { appConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbMinistryInvitationManager } from '@/application/db-ministry-invitation-manager';
import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '@/domain/branded-ids';
import { InsufficientInvitationAuthorityError } from '@/domain/errors/insufficient-invitation-authority';
import { InvalidInvitationRoleError } from '@/domain/errors/invalid-invitation-role';
import { InviteeAlreadyMinistryMemberError } from '@/domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '@/domain/errors/ministry-invitation-not-found';
import { MissingOutboxDeliveryRecordError } from '@/domain/errors/missing-outbox-delivery-record';
import { ResendCooldownActiveError } from '@/domain/errors/resend-cooldown-active';
import { ResendDailyCapExceededError } from '@/domain/errors/resend-daily-cap-exceeded';

const churchId = 'church_1' as ChurchId;
const ministryId = 'ministry_1' as MinistryId;
const adminId = 'admin_1' as UserId;
const leaderId = 'leader_1' as UserId;
const inviteeUserId = 'invitee_1' as UserId;
const roleId = 'role_1' as RoleId;
const fakeTx = { id: 'fake-tx' } as never;

const repo = {
  acquireMintLock: vi.fn(),
  acquireResendLock: vi.fn(),
  findChurchMemberByEmail: vi.fn(),
  findPendingByInvitee: vi.fn(),
  findPendingByChurchInvitation: vi.fn(),
  findPendingById: vi.fn(),
  hasActiveMinistryMembership: vi.fn(),
  findPendingChurchInvitationByEmail: vi.fn(),
  createChainedChurchInvitation: vi.fn(),
  create: vi.fn(),
  refreshExpiry: vi.fn(),
  applyResend: vi.fn(),
  enqueueOutboxMessage: vi.fn(),
};

const roleRepository = { listByMinistry: vi.fn() };
const ministryRepository = { getById: vi.fn() };
const authorityManager = {
  canManageMinistry: vi.fn(),
  canManageChurch: vi.fn(),
};
const unitOfWork = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeTx)) };
const outboxRepository = { findLatestStatusForMinistryInvitation: vi.fn() };
const notifications = { enqueue: vi.fn() };

function createManager(
  config: typeof appConfig = appConfig,
): DbMinistryInvitationManager {
  return new DbMinistryInvitationManager({
    repo: repo as never,
    roleRepository: roleRepository as never,
    ministryRepository: ministryRepository as never,
    authorityManager: authorityManager as never,
    unitOfWork: unitOfWork as never,
    outboxRepository: outboxRepository as never,
    notifications,
    config,
  });
}

function baseMintInput() {
  return {
    churchId,
    ministryId,
    inviterId: adminId,
    email: 'outsider@example.com',
    ministryAccessLevel: 'volunteer' as const,
    roleIds: [] as RoleId[],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  ministryRepository.getById.mockResolvedValue({ id: ministryId, churchId });
  authorityManager.canManageMinistry.mockResolvedValue(true);
  authorityManager.canManageChurch.mockResolvedValue(true);
  roleRepository.listByMinistry.mockResolvedValue([{ id: roleId }]);
  repo.findChurchMemberByEmail.mockResolvedValue(null);
  repo.findPendingChurchInvitationByEmail.mockResolvedValue(null);
  repo.createChainedChurchInvitation.mockResolvedValue({
    id: 'church-invitation-1',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  });
  repo.create.mockResolvedValue({ id: 'invitation-1', kind: 'chained' });
});

describe('DbMinistryInvitationManager.mint — scope resolution', () => {
  it('throws MinistryInvitationNotFoundError when the Ministry does not exist', async () => {
    ministryRepository.getById.mockRejectedValueOnce(
      new NotFoundError('Ministry not found: x'),
    );

    await expect(createManager().mint(baseMintInput())).rejects.toBeInstanceOf(
      MinistryInvitationNotFoundError,
    );
    expect(authorityManager.canManageMinistry).not.toHaveBeenCalled();
  });

  it('throws MinistryInvitationNotFoundError when the caller cannot manage the Ministry', async () => {
    authorityManager.canManageMinistry.mockResolvedValueOnce(false);

    await expect(createManager().mint(baseMintInput())).rejects.toBeInstanceOf(
      MinistryInvitationNotFoundError,
    );
    expect(repo.acquireMintLock).not.toHaveBeenCalled();
  });

  it('throws InsufficientInvitationAuthorityError when a non-admin requests leader access', async () => {
    authorityManager.canManageChurch.mockResolvedValueOnce(false);

    await expect(
      createManager().mint({
        ...baseMintInput(),
        inviterId: leaderId,
        ministryAccessLevel: 'leader',
      }),
    ).rejects.toBeInstanceOf(InsufficientInvitationAuthorityError);
    expect(repo.acquireMintLock).not.toHaveBeenCalled();
  });

  it('allows a non-admin requesting volunteer access', async () => {
    authorityManager.canManageChurch.mockResolvedValueOnce(false);

    await expect(
      createManager().mint({
        ...baseMintInput(),
        inviterId: leaderId,
        ministryAccessLevel: 'volunteer',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects an invalid Role id with neither half created', async () => {
    roleRepository.listByMinistry.mockResolvedValueOnce([
      { id: 'other-role' as RoleId },
    ]);

    await expect(
      createManager().mint({ ...baseMintInput(), roleIds: [roleId] }),
    ).rejects.toBeInstanceOf(InvalidInvitationRoleError);
    expect(repo.acquireMintLock).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('DbMinistryInvitationManager.mint — recipient resolution', () => {
  it('acquires the mint lock before resolving the recipient', async () => {
    await createManager().mint(baseMintInput());

    expect(repo.acquireMintLock).toHaveBeenCalledWith({
      ministryId,
      email: 'outsider@example.com',
      tx: fakeTx,
    });
  });

  it('rejects an existing Church Member who already holds Ministry Membership', async () => {
    repo.findChurchMemberByEmail.mockResolvedValueOnce(inviteeUserId);
    repo.hasActiveMinistryMembership.mockResolvedValueOnce(true);

    await expect(createManager().mint(baseMintInput())).rejects.toBeInstanceOf(
      InviteeAlreadyMinistryMemberError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates a Ministry-only invitation for an existing Church Member with no pending row', async () => {
    repo.findChurchMemberByEmail.mockResolvedValueOnce(inviteeUserId);
    repo.hasActiveMinistryMembership.mockResolvedValueOnce(false);
    repo.findPendingByInvitee.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce({
      id: 'invitation-1',
      kind: 'ministry-only',
    });

    const invitation = await createManager().mint(baseMintInput());

    expect(invitation).toEqual({ id: 'invitation-1', kind: 'ministry-only' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, ministryId, inviteeUserId }),
    );
    expect(repo.refreshExpiry).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ministry_invitation',
        to: [{ userId: inviteeUserId, churchId }],
        data: { ministryInvitationId: 'invitation-1' },
      }),
    );
    expect(repo.enqueueOutboxMessage).not.toHaveBeenCalled();
  });

  it('refreshes rather than duplicates when a pending invitee row already exists', async () => {
    const existing = { id: 'invitation-1', kind: 'ministry-only' };
    repo.findChurchMemberByEmail.mockResolvedValueOnce(inviteeUserId);
    repo.hasActiveMinistryMembership.mockResolvedValueOnce(false);
    repo.findPendingByInvitee.mockResolvedValueOnce(existing);
    repo.refreshExpiry.mockResolvedValueOnce(existing);

    const invitation = await createManager().mint(baseMintInput());

    expect(invitation).toBe(existing);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.refreshExpiry).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, ministryInvitation: existing }),
    );
  });

  it('mints a chained pair for a recipient outside the Church with no pending Church Invitation', async () => {
    const invitation = await createManager().mint(baseMintInput());

    expect(repo.createChainedChurchInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, email: 'outsider@example.com' }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ churchInvitationId: 'church-invitation-1' }),
    );
    expect(repo.enqueueOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, kind: 'invitation.chained' }),
    );
    expect(invitation).toEqual({ id: 'invitation-1', kind: 'chained' });
  });

  it('reuses a still-pending chained Church Invitation rather than minting a second one', async () => {
    repo.findPendingChurchInvitationByEmail.mockResolvedValueOnce({
      id: 'existing-church-invitation',
      expiresAt: new Date('2030-02-01T00:00:00Z'),
    });

    await createManager().mint(baseMintInput());

    expect(repo.createChainedChurchInvitation).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        churchInvitationId: 'existing-church-invitation',
      }),
    );
  });
});

describe('DbMinistryInvitationManager.resend', () => {
  it('applies the same scope check as mint before touching the invitation', async () => {
    authorityManager.canManageMinistry.mockResolvedValueOnce(false);

    await expect(
      createManager().resend({
        churchId,
        ministryId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
        callerId: adminId,
      }),
    ).rejects.toBeInstanceOf(MinistryInvitationNotFoundError);
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('throws MinistryInvitationNotFoundError when the target invitation is not pending', async () => {
    repo.findPendingById.mockResolvedValueOnce(null);

    await expect(
      createManager().resend({
        churchId,
        ministryId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
        callerId: adminId,
      }),
    ).rejects.toBeInstanceOf(MinistryInvitationNotFoundError);
  });

  it('acquires the resend lock before reading the invitation', async () => {
    const existing = { id: 'invitation-1', kind: 'chained', resendCount: 0 };
    repo.findPendingById.mockResolvedValueOnce(existing);
    repo.applyResend.mockResolvedValueOnce(existing);

    await createManager().resend({
      churchId,
      ministryId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
      callerId: adminId,
    });

    expect(repo.acquireResendLock).toHaveBeenCalledWith({
      ministryInvitationId: 'invitation-1',
      tx: fakeTx,
    });
    const [lockCallOrder] = repo.acquireResendLock.mock.invocationCallOrder;
    const [findCallOrder] = repo.findPendingById.mock.invocationCallOrder;
    expect(lockCallOrder).toBeDefined();
    expect(findCallOrder).toBeDefined();
    expect(lockCallOrder as number).toBeLessThan(findCallOrder as number);
  });

  it('refreshes expiry and enqueues a fresh delivery using the existing kind', async () => {
    const existing = {
      id: 'invitation-1',
      kind: 'chained',
      resendCount: 0,
    };
    repo.findPendingById.mockResolvedValueOnce(existing);
    repo.applyResend.mockResolvedValueOnce(existing);

    const invitation = await createManager().resend({
      churchId,
      ministryId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
      callerId: adminId,
    });

    expect(invitation).toBe(existing);
    expect(repo.applyResend).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId,
        ministryInvitation: existing,
        throttle: expect.objectContaining({ resendCount: 1 }),
      }),
    );
    expect(repo.enqueueOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, kind: 'invitation.chained' }),
    );
  });

  it('rejects a resend within the 60-second cooldown', async () => {
    const existing = {
      id: 'invitation-1',
      kind: 'chained',
      lastResendAt: new Date(),
      resendCount: 1,
      resendWindowStartedAt: new Date(),
    };
    repo.findPendingById.mockResolvedValueOnce(existing);

    await expect(
      createManager().resend({
        churchId,
        ministryId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
        callerId: adminId,
      }),
    ).rejects.toBeInstanceOf(ResendCooldownActiveError);
    expect(repo.applyResend).not.toHaveBeenCalled();
    expect(repo.enqueueOutboxMessage).not.toHaveBeenCalled();
  });

  it('rejects a resend once the daily cap is reached within the current window', async () => {
    const existing = {
      id: 'invitation-1',
      kind: 'chained',
      lastResendAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      resendCount: 10,
      resendWindowStartedAt: new Date(),
    };
    repo.findPendingById.mockResolvedValueOnce(existing);

    await expect(
      createManager().resend({
        churchId,
        ministryId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
        callerId: adminId,
      }),
    ).rejects.toBeInstanceOf(ResendDailyCapExceededError);
    expect(repo.applyResend).not.toHaveBeenCalled();
    expect(repo.enqueueOutboxMessage).not.toHaveBeenCalled();
  });

  it('allows a resend once the daily-cap window has rolled over', async () => {
    const existing = {
      id: 'invitation-1',
      kind: 'chained',
      lastResendAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      resendCount: 10,
      resendWindowStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };
    repo.findPendingById.mockResolvedValueOnce(existing);
    repo.applyResend.mockResolvedValueOnce(existing);

    await expect(
      createManager().resend({
        churchId,
        ministryId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
        callerId: adminId,
      }),
    ).resolves.toBe(existing);
    expect(repo.applyResend).toHaveBeenCalledWith(
      expect.objectContaining({
        throttle: expect.objectContaining({ resendCount: 1 }),
      }),
    );
  });
});

describe('DbMinistryInvitationManager.getDeliveryStatus', () => {
  it('returns the outbox repository status for the invitation', async () => {
    outboxRepository.findLatestStatusForMinistryInvitation.mockResolvedValueOnce(
      'sent',
    );

    const status = await createManager().getDeliveryStatus({
      churchId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
    });

    expect(status).toBe('sent');
    expect(
      outboxRepository.findLatestStatusForMinistryInvitation,
    ).toHaveBeenCalledWith({
      churchId,
      ministryInvitationId: 'invitation-1',
    });
  });

  it("maps the infrastructure 'processing' status to 'pending'", async () => {
    outboxRepository.findLatestStatusForMinistryInvitation.mockResolvedValueOnce(
      'processing',
    );

    const status = await createManager().getDeliveryStatus({
      churchId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
    });

    expect(status).toBe('pending');
  });

  it('throws when no outbox message exists for the invitation', async () => {
    outboxRepository.findLatestStatusForMinistryInvitation.mockResolvedValueOnce(
      null,
    );

    await expect(
      createManager().getDeliveryStatus({
        churchId,
        ministryInvitationId: 'invitation-1' as MinistryInvitationId,
      }),
    ).rejects.toThrow(MissingOutboxDeliveryRecordError);
  });
});

describe('DbMinistryInvitation lifetime', () => {
  const NOW = new Date('2030-03-01T12:00:00Z');
  const INJECTED_TTL_MS = 3 * 60 * 60 * 1000;
  const injected = {
    ...appConfig,
    ministryInvitation: { ttlMs: INJECTED_TTL_MS },
  };
  const EXPECTED_EXPIRY = new Date(NOW.getTime() + INJECTED_TTL_MS);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mints a Ministry-only invitation expiring after the injected lifetime', async () => {
    repo.findChurchMemberByEmail.mockResolvedValueOnce(inviteeUserId);
    repo.hasActiveMinistryMembership.mockResolvedValueOnce(false);
    repo.findPendingByInvitee.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce({
      id: 'invitation-1',
      kind: 'ministry-only',
    });

    await createManager(injected).mint(baseMintInput());

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRY }),
    );
  });

  it('restarts the clock from the resend moment, not the previous expiry', async () => {
    const existing = {
      id: 'invitation-1',
      kind: 'ministry-only',
      resendCount: 0,
    };
    repo.findPendingById.mockResolvedValueOnce(existing);
    repo.applyResend.mockResolvedValueOnce(existing);

    await createManager(injected).resend({
      churchId,
      ministryId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
      callerId: adminId,
    });

    expect(repo.applyResend).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRY }),
    );
  });

  it('defaults to seven days', async () => {
    repo.findChurchMemberByEmail.mockResolvedValueOnce(inviteeUserId);
    repo.hasActiveMinistryMembership.mockResolvedValueOnce(false);
    repo.findPendingByInvitee.mockResolvedValueOnce(null);
    repo.create.mockResolvedValueOnce({
      id: 'invitation-1',
      kind: 'ministry-only',
    });

    await createManager().mint(baseMintInput());

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date(NOW.getTime() + SEVEN_DAYS_MS),
      }),
    );
  });
});
