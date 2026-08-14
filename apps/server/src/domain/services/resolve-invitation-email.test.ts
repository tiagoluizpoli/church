import { describe, expect, it } from 'vitest';
import { resolveInvitationEmail } from './resolve-invitation-email';

describe('resolveInvitationEmail', () => {
  it('resolves the existing-member email when only inviteeEmail is set', () => {
    const email = resolveInvitationEmail({
      inviteeEmail: 'member@example.test',
      churchInvitationEmail: null,
    });

    expect(email).toBe('member@example.test');
  });

  it('resolves the chained-invitation email when only churchInvitationEmail is set', () => {
    const email = resolveInvitationEmail({
      inviteeEmail: null,
      churchInvitationEmail: 'outsider@example.test',
    });

    expect(email).toBe('outsider@example.test');
  });

  it('throws — never returns a value — when neither source resolves, the state the DB check constraint forbids', () => {
    expect(() =>
      resolveInvitationEmail({
        inviteeEmail: null,
        churchInvitationEmail: null,
      }),
    ).toThrow(/neither an invitee User nor a Church Invitation/);
  });
});
