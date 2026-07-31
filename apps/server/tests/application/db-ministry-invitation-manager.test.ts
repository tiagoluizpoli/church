import { NotFoundError } from '@church/core';
import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbMinistryInvitationManager } from '../../src/application/db-ministry-invitation-manager';
import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../src/domain/branded-ids';
import { InsufficientInvitationAuthorityError } from '../../src/domain/errors/insufficient-invitation-authority';
import { InvalidInvitationRoleError } from '../../src/domain/errors/invalid-invitation-role';
import { InviteeAlreadyMinistryMemberError } from '../../src/domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '../../src/domain/errors/ministry-invitation-not-found';

const churchId = 'church_1' as ChurchId;
const ministryId = 'ministry_1' as MinistryId;
const adminId = 'admin_1' as UserId;
const leaderId = 'leader_1' as UserId;
const inviteeUserId = 'invitee_1' as UserId;
const roleId = 'role_1' as RoleId;
const fakeTx = { id: 'fake-tx' } as never;

const repo = {
  acquireMintLock: vi.fn(),
  findChurchMemberByEmail: vi.fn(),
  findPendingByInvitee: vi.fn(),
  findPendingByChurchInvitation: vi.fn(),
  findPendingById: vi.fn(),
  hasActiveMinistryMembership: vi.fn(),
  findPendingChurchInvitationByEmail: vi.fn(),
  createChainedChurchInvitation: vi.fn(),
  create: vi.fn(),
  refreshExpiry: vi.fn(),
  enqueueOutboxMessage: vi.fn(),
};

const roleRepository = { listByMinistry: vi.fn() };
const ministryRepository = { getById: vi.fn() };
const authorityManager = {
  canManageMinistry: vi.fn(),
  canManageChurch: vi.fn(),
};
const unitOfWork = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeTx)) };

function createManager(): DbMinistryInvitationManager {
  return new DbMinistryInvitationManager(
    repo as never,
    roleRepository as never,
    ministryRepository as never,
    authorityManager as never,
    unitOfWork as never,
  );
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
    expect(repo.enqueueOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, kind: 'invitation.ministry' }),
    );
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

  it('refreshes expiry and enqueues a fresh delivery using the existing kind', async () => {
    const existing = { id: 'invitation-1', kind: 'chained' };
    repo.findPendingById.mockResolvedValueOnce(existing);
    repo.refreshExpiry.mockResolvedValueOnce(existing);

    const invitation = await createManager().resend({
      churchId,
      ministryId,
      ministryInvitationId: 'invitation-1' as MinistryInvitationId,
      callerId: adminId,
    });

    expect(invitation).toBe(existing);
    expect(repo.enqueueOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({ churchId, kind: 'invitation.chained' }),
    );
  });
});
