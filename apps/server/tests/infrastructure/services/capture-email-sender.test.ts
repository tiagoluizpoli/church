import { m } from '@church/i18n/messages';
import { fromDate } from '@church/time';
import { describe, expect, it } from 'vitest';
import type { MinistryInvitationEmail } from '@/domain/contracts/infrastructure/email-sender';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';

function buildPayload(
  overrides: Partial<MinistryInvitationEmail> = {},
): MinistryInvitationEmail {
  return {
    kind: 'invitation.chained',
    to: 'invitee@example.com',
    churchName: 'Grace Church',
    ministryName: 'Worship Team',
    ministryAccessLevel: 'volunteer',
    roleNames: ['Vocalist'],
    expiresAt: fromDate({ date: new Date('2026-08-01T00:00:00Z') }),
    churchTimezone: 'UTC',
    redemptionUrl: 'https://app.church.test/invitations/church/abc',
    ...overrides,
  };
}

describe('CaptureEmailSender', () => {
  it('records a sent payload instead of dispatching mail', async () => {
    const sender = new CaptureEmailSender();
    const payload = buildPayload();

    const result = await sender.send({ payload, locale: 'en' });

    expect(sender.sent).toEqual([payload]);
    expect(result).toEqual({});
  });

  it('accumulates every send in order', async () => {
    const sender = new CaptureEmailSender();
    const first = buildPayload({ to: 'first@example.com' });
    const second = buildPayload({ to: 'second@example.com' });

    await sender.send({ payload: first, locale: 'en' });
    await sender.send({ payload: second, locale: 'en' });

    expect(sender.sent).toEqual([first, second]);
  });

  it('deduplicates a repeated idempotency key, like the provider', async () => {
    const sender = new CaptureEmailSender();
    const email = sender.prepare({ payload: buildPayload() });

    await sender.deliver({ email, idempotencyKey: 'outbox-message/row-1' });
    await sender.deliver({ email, idempotencyKey: 'outbox-message/row-1' });
    await sender.deliver({ email, idempotencyKey: 'outbox-message/row-2' });

    expect(sender.delivered).toEqual([email, email]);
  });

  it('returns the most recently captured verification code for the recipient', async () => {
    const sender = new CaptureEmailSender();
    await sender.send({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace Church',
        code: '111111',
        codeLifetime: { minutes: 10 },
      },
      locale: 'en',
    });
    await sender.send({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace Church',
        code: '222222',
        codeLifetime: { minutes: 10 },
      },
      locale: 'en',
    });

    expect(sender.lastVerificationCodeFor({ to: 'invitee@example.com' })).toBe(
      '222222',
    );
  });

  it('captures the exact prepared verification email: Church sender on the capture mailbox, HTML and text', async () => {
    const sender = new CaptureEmailSender();
    await sender.send({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace Church',
        code: '333333',
        codeLifetime: { minutes: 10 },
      },
      locale: 'pt-BR',
    });

    const [email] = sender.delivered;
    expect(email?.locale).toBe('pt-BR');
    expect(email?.request).toMatchObject({
      from: '"Grace Church" <capture@church.test>',
      to: 'invitee@example.com',
      subject: m.email_verification_code_subject(
        { code: '333333', churchName: 'Grace Church' },
        { locale: 'pt-BR' },
      ),
      html: expect.stringContaining('333333'),
      text: expect.stringContaining('333333'),
    });
  });

  it('returns undefined when no verification code was captured for the recipient', async () => {
    const sender = new CaptureEmailSender();
    await sender.send({
      payload: buildPayload({ to: 'other@example.com' }),
      locale: 'en',
    });

    expect(
      sender.lastVerificationCodeFor({ to: 'invitee@example.com' }),
    ).toBeUndefined();
  });
});
