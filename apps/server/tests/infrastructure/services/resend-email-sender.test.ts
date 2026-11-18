import { fromDate, type Instant } from '@church/time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChainedInvitationEmail,
  ChurchBootstrapInvitationEmail,
  EmailPayload,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
} from '@/domain/contracts/infrastructure/email-sender';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  // `new Resend()` needs a constructible implementation, not an arrow function.
  Resend: vi.fn(
    class {
      emails = { send: sendMock };
    },
  ),
}));

const { ResendEmailSender } = await import(
  '@/infrastructure/services/resend-email-sender'
);

function buildChainedPayload(): ChainedInvitationEmail {
  return {
    kind: 'invitation.chained',
    to: 'invitee@example.com',
    churchName: 'Grace Church',
    ministryName: 'Worship Team',
    ministryAccessLevel: 'volunteer',
    roleNames: ['Vocalist'],
    inviterName: 'Ana',
    expiresAt: fromDate({ date: new Date('2026-08-01T00:00:00Z') }),
    churchTimezone: 'UTC',
    redemptionUrl: 'https://app.church.test/invitations/church/abc',
  };
}

function buildBootstrapPayload(): ChurchBootstrapInvitationEmail {
  return {
    kind: 'invitation.church-bootstrap',
    to: 'admin@example.com',
    churchName: 'Grace Church',
    expiresAt: '2026-12-01T02:30:00.000Z' as Instant,
    churchTimezone: 'America/Sao_Paulo',
    redemptionUrl: 'https://app.church.test/invitations/church/xyz',
  };
}

const digestFacts = {
  churchName: 'Grace Church',
  churchTimezone: 'UTC',
  recipientFirstName: 'Sam',
  ministryName: 'Hospitality',
  volunteerName: 'Jamie Rivera',
  actionUrl: 'https://app.church.test/schedules',
};

function buildDigestPayload(): TransferMinistryDigestEmail {
  return {
    kind: 'transfer.ministry-digest',
    to: ['leader-one@example.com', 'leader-two@example.com'],
    ...digestFacts,
    withdrawnAssignments: [
      {
        startsAt: fromDate({ date: new Date('2026-09-20T10:00:00Z') }),
        endsAt: fromDate({ date: new Date('2026-09-20T11:00:00Z') }),
        eventTitle: 'Sunday Gathering',
        roleName: 'Greeter',
        sectorName: 'Lobby',
      },
    ],
  };
}

function buildLeaderlessPayload(): TransferLeaderlessMinistryEmail {
  return {
    kind: 'transfer.leaderless-ministry',
    to: ['admin@example.com'],
    ...digestFacts,
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
      appName: 'Church',
    });
  }

  it('refuses to construct without an API key', () => {
    expect(
      () =>
        new ResendEmailSender({
          apiKey: '',
          from: 'Church <hi@church.test>',
          appName: 'Church',
        }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('maps a rejected send (network/connection error) to a retryable EmailSendError', async () => {
    sendMock.mockRejectedValue(new Error('fetch failed'));
    const sender = makeSender();

    await expect(
      sender.send({ payload: buildChainedPayload(), locale: 'en' }),
    ).rejects.toMatchObject({
      message: 'fetch failed',
      retryable: true,
    });
  });

  it('sends the composed email through the Resend client', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = makeSender();

    const result = await sender.send({
      payload: buildChainedPayload(),
      locale: 'en',
    });

    expect(sendMock).toHaveBeenCalledWith({
      from: '"Grace Church" <hi@church.test>',
      to: 'invitee@example.com',
      subject: expect.stringContaining('Worship Team'),
      html: expect.stringContaining('Worship Team'),
      text: expect.stringContaining('Worship Team'),
    });
    expect(result).toEqual({ providerMessageId: 'email-1' });
  });

  it('delivers the password reset with its text alternative, no reply-to', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-pr' }, error: null });
    const sender = makeSender();

    await sender.send({
      payload: {
        kind: 'auth.password-reset',
        to: 'user@example.com',
        resetUrl: 'https://app.church.test/reset?token=t',
        linkLifetime: { minutes: 60 },
      },
      locale: 'en',
    });

    const request = sendMock.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      from: '"Church" <hi@church.test>',
      to: 'user@example.com',
      text: expect.stringContaining('https://app.church.test/reset?token=t'),
    });
    expect(request).not.toHaveProperty('replyTo');
  });

  it('composes a bootstrap email with no ministry content', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildBootstrapPayload(), locale: 'en' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.not.stringContaining('Roles:') }),
    );
  });

  it('composes a Ministry digest addressed to every leader, listing the withdrawn assignment', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-3' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildDigestPayload(), locale: 'en' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['leader-one@example.com', 'leader-two@example.com'],
        subject: expect.stringContaining('Hospitality'),
        html: expect.stringContaining('Greeter'),
        text: expect.stringContaining(
          'Sun 20 Sep · 10:00–11:00 · Sunday Gathering · Greeter · Lobby',
        ),
      }),
    );
    // The destination Church is never named (spec §8.8).
    expect(sendMock.mock.calls[0]?.[0].html).not.toContain('destination');
  });

  it('composes a leaderless-Ministry escalation addressed to admins', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-4' }, error: null });
    const sender = makeSender();

    await sender.send({ payload: buildLeaderlessPayload(), locale: 'en' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@example.com'],
        subject: expect.stringContaining('Jamie Rivera'),
        text: expect.stringContaining(
          'The Hospitality ministry now has no leader.',
        ),
      }),
    );
  });

  it('delivers a prepared email unchanged, passing the stable idempotency key', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-5' }, error: null });
    const sender = makeSender();
    const email = sender.prepare({ payload: buildChainedPayload() });

    const result = await sender.deliver({
      email,
      idempotencyKey: 'outbox-message/row-1',
    });

    expect(sendMock).toHaveBeenCalledWith(email.request, {
      idempotencyKey: 'outbox-message/row-1',
    });
    expect(result).toEqual({ providerMessageId: 'email-5' });
  });

  it('sends a layout email with its plain text and Church sender exactly as prepared', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-6' }, error: null });
    const sender = makeSender();
    const email = sender.prepare({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace, "Truth" <Church>',
        code: '123456',
        codeLifetime: { minutes: 10 },
      },
      locale: 'pt-BR',
    });

    await sender.deliver({ email, idempotencyKey: 'outbox-message/row-2' });

    expect(email.request).toMatchObject({
      from: '"Grace, \\"Truth\\" <Church>" <hi@church.test>',
      text: expect.stringContaining('123456'),
    });
    expect(sendMock).toHaveBeenCalledWith(email.request, {
      idempotencyKey: 'outbox-message/row-2',
    });
  });

  it('replays a historical html-only request unchanged, without adding text', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-7' }, error: null });
    const sender = makeSender();
    const historical = {
      payload: buildChainedPayload(),
      locale: 'en' as const,
      request: {
        from: 'Old Name <old@church.test>',
        to: 'invitee@example.com',
        subject: 'Saved subject',
        html: '<p>Saved body</p>',
      },
    };

    await sender.deliver({
      email: historical,
      idempotencyKey: 'outbox-message/row-3',
    });

    expect(sendMock).toHaveBeenCalledWith(
      {
        from: 'Old Name <old@church.test>',
        to: 'invitee@example.com',
        subject: 'Saved subject',
        html: '<p>Saved body</p>',
      },
      { idempotencyKey: 'outbox-message/row-3' },
    );
  });

  it.each([
    ['invalid_idempotent_request', false],
    ['concurrent_idempotent_requests', true],
  ])('maps a 409 %s to retryable=%s', async (name, retryable) => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'idempotency conflict', name, statusCode: 409 },
    });
    const sender = makeSender();

    await expect(
      sender.deliver({
        email: sender.prepare({ payload: buildChainedPayload() }),
        idempotencyKey: 'outbox-message/row-1',
      }),
    ).rejects.toMatchObject({ retryable });
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
      sender.send({
        payload: buildChainedPayload() as EmailPayload,
        locale: 'en',
      }),
    ).rejects.toMatchObject({
      message: 'send failed',
      retryable,
    });
  });
});
