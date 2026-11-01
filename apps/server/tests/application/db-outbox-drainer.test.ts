import { appConfig } from '@church/app-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbOutboxDrainer } from '@/application/db-outbox-drainer';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
} from '@/domain/branded-ids';
import { EmailSendError } from '@/domain/errors/email-send-error';

const churchId = 'church_1' as ChurchId;
const ministryId = 'ministry_1' as MinistryId;
const inviterId = 'inviter_1' as UserId;
const roleId = 'role_1' as RoleId;
const fakeTx = { id: 'fake-tx' } as never;

const outboxRepository = {
  claimPending: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  recordEmailPrepared: vi.fn(),
  recordEmailDelivered: vi.fn(),
};
const invitationRepository = {
  findById: vi.fn(),
  resolveRecipientEmail: vi.fn(),
};
const churchRepository = { getById: vi.fn(), findMemberName: vi.fn() };
const ministryRepository = { getById: vi.fn() };
const roleRepository = { getById: vi.fn() };
const volunteerTransferRepository = { getDigestDetails: vi.fn() };
const emailSender = {
  prepare: vi.fn((input: { payload: unknown }) => ({
    payload: input.payload,
    locale: 'en',
    request: {},
  })),
  deliver: vi.fn(),
};
const unitOfWork = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeTx)) };

function createDrainer(): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository: outboxRepository as never,
    invitationRepository: invitationRepository as never,
    churchRepository: churchRepository as never,
    ministryRepository: ministryRepository as never,
    roleRepository: roleRepository as never,
    volunteerTransferRepository: volunteerTransferRepository as never,
    emailSender: emailSender as never,
    notifier: { send: vi.fn() },
    schedulingFacts: {} as never,
    unitOfWork: unitOfWork as never,
    config: appConfig,
    webBaseUrl: 'https://app.test',
  });
}

function buildMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'outbox_1',
    churchId,
    kind: 'invitation.chained',
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
  churchRepository.getById.mockResolvedValue({
    name: 'Grace Church',
    timezone: 'America/Sao_Paulo',
  });
  churchRepository.findMemberName.mockResolvedValue('Pastor Ana');
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
    emailSender.deliver.mockResolvedValue({ providerMessageId: 'provider-1' });

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'outbox-message/outbox_1',
        email: expect.objectContaining({
          payload: expect.objectContaining({
            kind: 'invitation.chained',
            to: 'invitee@example.com',
            churchName: 'Grace Church',
            ministryName: 'Worship Team',
            roleNames: ['Vocalist'],
            inviterName: 'Pastor Ana',
            churchTimezone: 'America/Sao_Paulo',
          }),
        }),
      }),
    );
    expect(emailSender.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ locale: appConfig.defaultLocale }),
    );
    expect(churchRepository.findMemberName).toHaveBeenCalledWith({
      id: churchId,
      userId: inviterId,
    });
    expect(outboxRepository.markSent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_1',
        providerMessageId: 'provider-1',
      }),
    );
  });

  it('fails terminally without sending when the inviter cannot be resolved', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    churchRepository.findMemberName.mockResolvedValue(null);

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(emailSender.prepare).not.toHaveBeenCalled();
    expect(emailSender.deliver).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_1',
        status: 'failed',
        lastError: 'Invitation inviter could not be resolved',
      }),
    );
  });

  it('fails terminally without sending when the invitation no longer exists', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(null);

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(emailSender.deliver).not.toHaveBeenCalled();
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

    expect(emailSender.deliver).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('reschedules a retryable failure with backoff, below the attempt cap', async () => {
    const message = buildMessage({ attempts: 1 });
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.deliver.mockRejectedValue(
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
    const { maxAttempts } = appConfig.outbox;
    const message = buildMessage({ attempts: maxAttempts - 1 });
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.deliver.mockRejectedValue(
      new EmailSendError({ message: 'rate limited', retryable: true }),
    );

    await createDrainer().drainOnce({ limit: 10 });

    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: maxAttempts,
        status: 'failed',
      }),
    );
  });

  it('fails terminally immediately for a non-retryable failure', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.deliver.mockRejectedValue(
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
    expect(emailSender.deliver).not.toHaveBeenCalled();
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
    emailSender.deliver.mockResolvedValue({ providerMessageId: 'provider-1' });

    const result = await createDrainer().drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
  });

  it('propagates an error that is not an EmailSendError', async () => {
    const message = buildMessage();
    outboxRepository.claimPending.mockResolvedValue([message]);
    invitationRepository.findById.mockResolvedValue(buildInvitation());
    emailSender.deliver.mockRejectedValue(new Error('unexpected'));

    await expect(createDrainer().drainOnce({ limit: 10 })).rejects.toThrow(
      'unexpected',
    );
  });
});
