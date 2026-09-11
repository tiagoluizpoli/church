import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChurchBootstrapInvitationEmail,
  EmailPayload,
  MinistryInvitationEmail,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
} from '../../domain/contracts/infrastructure/email-sender';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const { ResendEmailSender } = await import('./resend-email-sender');

function buildChainedPayload(): MinistryInvitationEmail {
  return {
    kind: 'invitation.chained',
    to: 'invitee@example.com',
    churchName: 'Grace Church',
    ministryName: 'Worship Team',
    ministryAccessLevel: 'volunteer',
    roleNames: ['Vocalist'],
    expiresAt: new Date('2026-08-01T00:00:00Z'),
    redemptionUrl: 'https://app.church.test/invitations/church/abc',
  };
}

function buildBootstrapPayload(): ChurchBootstrapInvitationEmail {
  return {
    kind: 'invitation.church-bootstrap',
    to: 'admin@example.com',
    churchName: 'Grace Church',
    redemptionUrl: 'https://app.church.test/invitations/church/xyz',
  };
}

function buildDigestPayload(): TransferMinistryDigestEmail {
  return {
    kind: 'transfer.ministry-digest',
    to: ['leader-one@example.com', 'leader-two@example.com'],
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
}

function buildLeaderlessPayload(): TransferLeaderlessMinistryEmail {
  return {
    kind: 'transfer.leaderless-ministry',
    to: ['admin@example.com'],
    ministryName: 'Hospitality',
    volunteerName: 'Jamie Rivera',
    withdrawnAssignments: [],
  };
}

describe('ResendEmailSender', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  function makeSender() {
    return new ResendEmailSender({
      apiKey: 'test-key',
      from: 'Church <hi@church.test>',
    });
  }

  it('refuses to construct without an API key', () => {
    expect(
      () =>
        new ResendEmailSender({ apiKey: '', from: 'Church <hi@church.test>' }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('maps a rejected send (network/connection error) to a retryable EmailSendError', async () => {
    sendMock.mockRejectedValue(new Error('fetch failed'));
    const sender = makeSender();

    await expect(
      sender.send({ payload: buildChainedPayload() }),
    ).rejects.toMatchObject({
      message: 'fetch failed',
      retryable: true,
    });
  });

  it('sends the composed email through the Resend client', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = makeSender();

    const result = await sender.send({ payload: buildChainedPayload() });

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Church <hi@church.test>',
      to: 'invitee@example.com',
      subject: expect.stringContaining('Grace Church'),
      html: expect.stringContaining('Worship Team'),
    });
    expect(result).toEqual({ providerMessageId: 'email-1' });
  });

  it('composes a bootstrap email with no ministry content', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildBootstrapPayload() });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.not.stringContaining('Roles:') }),
    );
  });

  it('composes a Ministry digest addressed to every leader, listing the withdrawn assignment', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-3' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildDigestPayload() });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['leader-one@example.com', 'leader-two@example.com'],
        subject: expect.stringContaining('Hospitality'),
        html: expect.stringContaining('Greeter'),
      }),
    );
    // The destination Church is never named (spec §8.8).
    expect(sendMock.mock.calls[0]?.[0].html).not.toContain('destination');
  });

  it('composes a leaderless-Ministry escalation addressed to admins', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-4' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildLeaderlessPayload() });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@example.com'],
        subject: expect.stringContaining('no active leader'),
        html: expect.stringContaining('Jamie Rivera'),
      }),
    );
  });

  it.each([
    [400, false],
    [401, false],
    [403, false],
    [422, false],
    [429, true],
    [500, true],
  ])('maps a %i response to retryable=%s', async (statusCode, retryable) => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'send failed', name: 'error', statusCode },
    });
    const sender = makeSender();

    await expect(
      sender.send({ payload: buildChainedPayload() as EmailPayload }),
    ).rejects.toMatchObject({
      message: 'send failed',
      retryable,
    });
  });
});
