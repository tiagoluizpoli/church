import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type {
  MinistryInvitationEmail,
  TransferMinistryDigestEmail,
} from '@/domain/contracts/infrastructure/email-sender';
import { prepareEmail } from '@/infrastructure/services/email-templates';

const memberInvitation: MinistryInvitationEmail = {
  kind: 'invitation.ministry',
  to: 'member@example.com',
  churchName: 'Grace & <Truth>',
  ministryName: '<b>Worship</b>',
  ministryAccessLevel: 'volunteer',
  roleNames: ['Vocalist <i>lead</i>'],
  // 02:30 UTC is the previous evening on São Paulo's wall clock.
  expiresAt: '2026-12-01T02:30:00.000Z' as Instant,
  churchTimezone: 'America/Sao_Paulo',
  redemptionUrl: 'https://app.church.test/invitations/ministry/abc',
};

describe('prepareEmail — member Ministry Invitation', () => {
  it('renders the shared catalog in the recipient locale, in the Church Timezone', () => {
    const email = prepareEmail({
      payload: memberInvitation,
      from: 'church@example.com',
      locale: 'pt-BR',
    });

    expect(email.locale).toBe('pt-BR');
    expect(email.request.subject).toBe(
      m.notification_ministry_invitation_title(
        { ministryName: '<b>Worship</b>' },
        { locale: 'pt-BR' },
      ),
    );
    expect(email.request.html).toContain(
      m.email_ministry_invitation_accept({}, { locale: 'pt-BR' }),
    );
    expect(email.request.html).toContain('30/11/2026 23:30');
  });

  it('escapes interpolated facts so they never become markup', () => {
    const { html } = prepareEmail({
      payload: memberInvitation,
      from: 'church@example.com',
      locale: 'pt-BR',
    }).request;

    expect(html).toContain('&lt;b&gt;Worship&lt;/b&gt;');
    expect(html).toContain('Grace &amp; &lt;Truth&gt;');
    expect(html).toContain('Vocalist &lt;i&gt;lead&lt;/i&gt;');
    expect(html).not.toContain('<b>Worship</b>');
  });
});

describe('prepareEmail — Volunteer Transfer digests', () => {
  const digest: TransferMinistryDigestEmail = {
    kind: 'transfer.ministry-digest',
    to: ['leader@example.com'],
    ministryName: '<b>Hospitality</b>',
    volunteerName: 'Ana & <Bia>',
    withdrawnAssignments: [
      {
        eventName: 'Culto <Domingo>',
        eventTimeBlockStart: '2026-12-06T12:00:00.000Z' as Instant,
        roleName: 'Recepção',
      },
    ],
  };

  it('renders the shared catalog in the recipient locale, escaping every fact', () => {
    const email = prepareEmail({
      payload: digest,
      from: 'church@example.com',
      locale: 'pt-BR',
    });

    expect(email.locale).toBe('pt-BR');
    expect(email.request.to).toEqual(['leader@example.com']);
    expect(email.request.subject).toBe(
      m.email_transfer_digest_subject(
        { volunteerName: 'Ana & <Bia>', ministryName: '<b>Hospitality</b>' },
        { locale: 'pt-BR' },
      ),
    );
    expect(email.request.html).toContain('Ana &amp; &lt;Bia&gt;');
    expect(email.request.html).toContain('Culto &lt;Domingo&gt;');
    expect(email.request.html).toContain('06/12/2026 12:00');
    expect(email.request.html).not.toContain('<b>Hospitality</b>');
  });

  it('frames the leaderless escalation and says when nothing was withdrawn', () => {
    const email = prepareEmail({
      payload: {
        ...digest,
        kind: 'transfer.leaderless-ministry',
        withdrawnAssignments: [],
      },
      from: 'church@example.com',
      locale: 'pt-BR',
    });

    expect(email.request.subject).toBe(
      m.email_transfer_leaderless_subject(
        { ministryName: '<b>Hospitality</b>' },
        { locale: 'pt-BR' },
      ),
    );
    expect(email.request.html).toContain(
      m.email_transfer_digest_no_assignments({}, { locale: 'pt-BR' }),
    );
  });
});
