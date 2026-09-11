import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbOutboxDrainer } from '../../src/application/db-outbox-drainer';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { EmailSendError } from '../../src/domain/errors/email-send-error';
import { OUTBOX_MAX_ATTEMPTS } from '../../src/domain/services/outbox-retry-policy';

const churchId = 'church_1' as ChurchId;
const ministryId = 'ministry_1' as MinistryId;
const inviterId = 'inviter_1' as UserId;
const roleId = 'role_1' as RoleId;
const volunteerId = 'volunteer_1' as VolunteerId;
const fakeTx = { id: 'fake-tx' } as never;

const outboxRepository = {
  claimPending: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
};
const invitationRepository = {
  findById: vi.fn(),
  resolveRecipientEmail: vi.fn(),
};
const churchRepository = { getById: vi.fn(), listAdminEmails: vi.fn() };
const ministryRepository = { getById: vi.fn() };
const roleRepository = { getById: vi.fn() };
const volunteerRepository = { listActiveLeaderEmails: vi.fn() };
const volunteerTransferRepository = { getDigestDetails: vi.fn() };
const emailSender = { send: vi.fn() };
const unitOfWork = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeTx)) };

function createDrainer(): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository: outboxRepository as never,
    invitationRepository: invitationRepository as never,
    churchRepository: churchRepository as never,
    ministryRepository: ministryRepository as never,
    roleRepository: roleRepository as never,
    volunteerRepository: volunteerRepository as never,
    volunteerTransferRepository: volunteerTransferRepository as never,
    emailSender: emailSender as never,
    unitOfWork: unitOfWork as never,
  });
}

function buildMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'outbox_1',
    churchId,
    kind: 'invitation.ministry',
    payload: { ministryInvitationId: 'invitation_1' },
    status: 'processing',
    attempts: 0,
    scheduledFor: new Date(),
    correlationId: 'corr_1',
    ...overrides,
  };
}

function buildInvitation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'invitation_1',
    churchId,
    ministryId,
    kind: 'ministry-only',
    status: 'pending',
    ministryAccessLevel: 'volunteer',
    roleIds: [roleId],
    expiresAt: new Date('2026-08-01T00:00:00Z'),
    inviterId,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  churchRepository.getById.mockResolvedValue({ name: 'Grace Church' });
  ministryRepository.getById.mockResolvedValue({ name: 'Worship Team' });
  roleRepository.getById.mockResolvedValue({ name: 'Vocalist' });
  invitationRepository.resolveRecipientEmail.mockResolvedValue(
    'invitee@example.com',
  );
});

describe('DbOutboxDrainer.drainOnce', () => {
  it('sends a claimed pending invitation and marks it sent', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockResolvedValue({ providerMessageId: 'provider-1' });

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          kind: 'invitation.ministry',
          to: 'invitee@example.com',
          churchName: 'Grace Church',
          ministryName: 'Worship Team',
          roleNames: ['Vocalist'],
        }),
      }),
    );
    expect(outboxRepository.markSent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_1',
        providerMessageId: 'provider-1',
      }),
    );
  });

  it('fails terminally without sending when the invitation no longer exists', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(null);

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'outbox_1', status: 'failed' }),
    );
  });

  it('fails terminally without sending when the invitation is no longer pending', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(
      buildInvitation({ status: 'canceled' }),
    );

    await createDrainer().drainOnce({ limit: 10 });

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('reschedules a retryable failure with backoff, below the attempt cap', async () => {
    const message = buildMessage({ attempts: 1 });
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockRejectedValue(
      new EmailSendError({ message: 'rate limited', retryable: true }),
    );

    await createDrainer().drainOnce({ limit: 10 });

    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_1',
        attempts: 2,
        status: 'pending',
        lastError: 'rate limited',
        scheduledFor: expect.any(Date),
      }),
    );
  });

  it('fails terminally once a retryable failure exhausts the attempt cap', async () => {
    const message = buildMessage({ attempts: OUTBOX_MAX_ATTEMPTS - 1 });
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockRejectedValue(
      new EmailSendError({ message: 'rate limited', retryable: true }),
    );

    await createDrainer().drainOnce({ limit: 10 });

    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: OUTBOX_MAX_ATTEMPTS,
        status: 'failed',
      }),
    );
  });

  it('fails terminally immediately for a non-retryable failure', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockRejectedValue(
      new EmailSendError({ message: 'invalid recipient', retryable: false }),
    );

    await createDrainer().drainOnce({ limit: 10 });

    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, status: 'failed' }),
    );
  });

  it('fails terminally for a kind with no delivery implementation yet', async () => {
    const message = buildMessage({
      kind: 'invitation.church-bootstrap',
      payload: { churchInvitationId: 'church-invitation-1' },
    });
    outboxRepository.claimPending.mockResolvedValue([message]);

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(invitationRepository.findById).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        lastError: expect.stringContaining('invitation.church-bootstrap'),
      }),
    );
  });

  it('aggregates counts across multiple claimed messages', async () => {
    const sentMessage = buildMessage({ id: 'outbox_sent' });
    const failedMessage = buildMessage({
      id: 'outbox_failed',
      kind: 'invitation.church-bootstrap',
      payload: { churchInvitationId: 'church-invitation-1' },
    });
    outboxRepository.claimPending.mockResolvedValue([
      sentMessage,
      failedMessage,
    ]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockResolvedValue({ providerMessageId: 'provider-1' });

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
  });

  it('propagates an error that is not an EmailSendError', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.send.mockRejectedValue(new Error('unexpected'));

    await expect(createDrainer().drainOnce({ limit: 10 })).rejects.toThrow(
      'unexpected',
    );
  });

  describe('Volunteer Transfer notifications (issue #60)', () => {
    const digestDetails = {
      ministryName: 'Hospitality',
      volunteerName: 'Jamie Rivera',
      withdrawnAssignments: [
        {
          eventName: 'Sunday Gathering',
          timeSlotStart: new Date('2026-09-20T10:00:00Z'),
          roleName: 'Greeter',
        },
      ],
    };

    beforeEach(() => {
      volunteerTransferRepository.getDigestDetails.mockResolvedValue(
        digestDetails,
      );
    });

    it('sends a Ministry digest to every active leader and marks it sent', async () => {
      const message = buildMessage({
        kind: 'transfer.ministry-digest',
        payload: { ministryId, volunteerId },
      });
      outboxRepository.claimPending.mockResolvedValue([message]);
      volunteerRepository.listActiveLeaderEmails.mockResolvedValue([
        'leader@example.com',
      ]);
      emailSender.send.mockResolvedValue({ providerMessageId: 'provider-2' });

      const result = await createDrainer().drainOnce({ limit: 10 });

      expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
      expect(volunteerTransferRepository.getDigestDetails).toHaveBeenCalledWith(
        {
          churchId,
          ministryId,
          volunteerId,
          correlationId: 'corr_1',
        },
      );
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: 'transfer.ministry-digest',
            to: ['leader@example.com'],
            ministryName: 'Hospitality',
            volunteerName: 'Jamie Rivera',
          }),
        }),
      );
      expect(outboxRepository.markSent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'outbox_1' }),
      );
    });

    it('fails terminally without sending a digest when the Ministry has no active leader', async () => {
      const message = buildMessage({
        kind: 'transfer.ministry-digest',
        payload: { ministryId, volunteerId },
      });
      outboxRepository.claimPending.mockResolvedValue([message]);
      volunteerRepository.listActiveLeaderEmails.mockResolvedValue([]);

      const result = await createDrainer().drainOnce({ limit: 10 });

      expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(outboxRepository.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('escalates a leaderless Ministry to every ChurchAdmin', async () => {
      const message = buildMessage({
        kind: 'transfer.leaderless-ministry',
        payload: { ministryId, volunteerId },
      });
      outboxRepository.claimPending.mockResolvedValue([message]);
      churchRepository.listAdminEmails.mockResolvedValue(['admin@example.com']);
      emailSender.send.mockResolvedValue({ providerMessageId: 'provider-3' });

      const result = await createDrainer().drainOnce({ limit: 10 });

      expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: 'transfer.leaderless-ministry',
            to: ['admin@example.com'],
          }),
        }),
      );
    });

    it('fails terminally without sending an escalation when the Church has no admin', async () => {
      const message = buildMessage({
        kind: 'transfer.leaderless-ministry',
        payload: { ministryId, volunteerId },
      });
      outboxRepository.claimPending.mockResolvedValue([message]);
      churchRepository.listAdminEmails.mockResolvedValue([]);

      const result = await createDrainer().drainOnce({ limit: 10 });

      expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
      expect(emailSender.send).not.toHaveBeenCalled();
    });
  });
});
