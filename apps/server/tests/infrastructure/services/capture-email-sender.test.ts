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
    redemptionUrl: 'https://app.church.test/invitations/church/abc',
    ...overrides,
  };
}

describe('CaptureEmailSender', () => {
  it('records a sent payload instead of dispatching mail', async () => {
    const sender = new CaptureEmailSender();
    const payload = buildPayload();

    const result = await sender.send({ payload });

    expect(sender.sent).toEqual([payload]);
    expect(result).toEqual({});
  });

  it('accumulates every send in order', async () => {
    const sender = new CaptureEmailSender();
    const first = buildPayload({ to: 'first@example.com' });
    const second = buildPayload({ to: 'second@example.com' });

    await sender.send({ payload: first });
    await sender.send({ payload: second });

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
      },
    });
    await sender.send({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Grace Church',
        code: '222222',
      },
    });

    expect(sender.lastVerificationCodeFor({ to: 'invitee@example.com' })).toBe(
      '222222',
    );
  });

  it('returns undefined when no verification code was captured for the recipient', async () => {
    const sender = new CaptureEmailSender();
    await sender.send({ payload: buildPayload({ to: 'other@example.com' }) });

    expect(
      sender.lastVerificationCodeFor({ to: 'invitee@example.com' }),
    ).toBeUndefined();
  });
});
