import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChurchBootstrapInvitationEmail,
  EmailPayload,
  MinistryInvitationEmail,
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

    await expect(sender.send(buildChainedPayload())).rejects.toMatchObject({
      message: 'fetch failed',
      retryable: true,
    });
  });

  it('sends the composed email through the Resend client', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = makeSender();

    await sender.send(buildChainedPayload());

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Church <hi@church.test>',
      to: 'invitee@example.com',
      subject: expect.stringContaining('Grace Church'),
      html: expect.stringContaining('Worship Team'),
    });
  });

  it('composes a bootstrap email with no ministry content', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const sender = makeSender();

    await sender.send(buildBootstrapPayload());

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.not.stringContaining('Roles:') }),
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
      sender.send(buildChainedPayload() as EmailPayload),
    ).rejects.toMatchObject({
      message: 'send failed',
      retryable,
    });
  });
});
