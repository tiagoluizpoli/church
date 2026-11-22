// PROTOTYPE (#989 Email design standard): sample payloads and identities. Throwaway.
import type { CalendarDay, Instant } from '@church/time';
import type { EmailPayload } from '@/domain/contracts/infrastructure/email-sender';

const i = (v: string) => v as Instant;
const d = (v: string) => v as CalendarDay;
const tz = 'America/Sao_Paulo';
const url =
  'https://app.church.test/invitations/church/9f2c1b7e-4d1a-4c8e-9a51-0b7f3c2e6a10';
const shift = (
  eventTitle: string,
  start: string,
  end: string,
  roleName: string,
) => ({
  eventTitle,
  roleName,
  sectorName: 'Palco',
  startsAt: i(start),
  endsAt: i(end),
});

export const samples: Record<string, EmailPayload> = {
  'auth.password-reset': {
    kind: 'auth.password-reset',
    to: 'maria@example.com',
    resetUrl: 'https://app.church.test/reset-password?token=Zx81kQpL0aB7',
    linkLifetime: { hours: 1 },
  },
  'invitation.church-bootstrap': {
    kind: 'invitation.church-bootstrap',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    expiresAt: i('2026-12-01T02:30:00.000Z'),
    churchTimezone: tz,
    redemptionUrl: url,
    ministryOffers: [
      {
        ministryName: 'Louvor',
        ministryAccessLevel: 'leader',
        roleNames: ['Vocal', 'Violão'],
        inviterName: 'Ana Souza',
      },
      {
        ministryName: 'Mídia',
        ministryAccessLevel: 'volunteer',
        roleNames: ['Projeção'],
        inviterName: 'Ana Souza',
      },
    ],
  },
  'invitation.ministry': {
    kind: 'invitation.ministry',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    recipientFirstName: 'Maria',
    inviterName: 'Ana Souza',
    ministryName: 'Louvor',
    ministryAccessLevel: 'volunteer',
    roleNames: ['Vocal'],
    expiresAt: i('2026-12-01T02:30:00.000Z'),
    churchTimezone: tz,
    redemptionUrl: url,
  },
  'invitation.verification-code': {
    kind: 'invitation.verification-code',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    code: '482913',
    codeLifetime: { minutes: 10 },
  },
  'schedule.published': {
    kind: 'schedule.published',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    recipientFirstName: 'Maria',
    ministryName: 'Louvor',
    cycleName: 'Dezembro 2026',
    churchTimezone: tz,
    shifts: [
      shift(
        'Culto de domingo',
        '2026-12-06T12:00:00.000Z',
        '2026-12-06T14:00:00.000Z',
        'Vocal',
      ),
      shift(
        'Culto de domingo',
        '2026-12-13T21:00:00.000Z',
        '2026-12-13T23:00:00.000Z',
        'Vocal',
      ),
      shift(
        'Cantata de Natal',
        '2026-12-24T22:00:00.000Z',
        '2026-12-25T00:30:00.000Z',
        'Vocal',
      ),
    ],
    actionUrl: 'https://app.church.test/schedules',
  },
  'availability.reminder': {
    kind: 'availability.reminder',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    recipientFirstName: 'Maria',
    ministryName: 'Louvor',
    cycleName: 'Janeiro 2027',
    cycleStartDate: d('2027-01-01'),
    cycleEndDate: d('2027-01-31'),
    actionUrl: 'https://app.church.test/availability',
    shiftCount: 9,
    answerBy: d('2026-12-20'),
  },
  'event.cancelled': {
    kind: 'event.cancelled',
    to: 'maria@example.com',
    churchName: 'CHURCH',
    recipientFirstName: 'Maria',
    eventTitle: 'Culto de jovens',
    start: i('2026-12-12T22:00:00.000Z'),
    churchTimezone: tz,
    shifts: [
      shift(
        'Culto de jovens',
        '2026-12-12T22:00:00.000Z',
        '2026-12-13T00:00:00.000Z',
        'Vocal',
      ),
    ],
    actionUrl: 'https://app.church.test/schedules',
  },
  'swap.request': {
    kind: 'swap.request',
    to: 'lider@example.com',
    churchName: 'CHURCH',
    recipientFirstName: 'Pedro',
    ministryName: 'Louvor',
    churchTimezone: tz,
    volunteerName: 'Maria Oliveira',
    shift: shift(
      'Culto de domingo',
      '2026-12-13T21:00:00.000Z',
      '2026-12-13T23:00:00.000Z',
      'Vocal',
    ),
    note: 'Vou estar viajando com a família nesse fim de semana, desculpa o aviso em cima da hora.',
    actionUrl: 'https://app.church.test/schedules/swap-requests',
  },
  'transfer.leaderless-ministry': {
    kind: 'transfer.leaderless-ministry',
    to: ['admin@example.com'],
    churchName: 'CHURCH',
    churchTimezone: tz,
    recipientFirstName: 'Ana',
    ministryName: 'Mídia',
    volunteerName: 'João Lima',
    withdrawnAssignments: [
      shift(
        'Culto de domingo',
        '2026-12-06T12:00:00.000Z',
        '2026-12-06T14:00:00.000Z',
        'Projeção',
      ),
      shift(
        'Culto de domingo',
        '2026-12-20T12:00:00.000Z',
        '2026-12-20T14:00:00.000Z',
        'Projeção',
      ),
    ],
    actionUrl: 'https://app.church.test/schedules',
  },
};

export interface Logo {
  path: string;
  width: number;
  height: number;
}

/** Church identity snapshotted into the payload; null = platform-branded. */
export interface Identity {
  churchName: string;
  logo?: Logo;
  accent: string;
}

export const identities: Record<string, Identity> = {
  'wide-navy': {
    churchName: 'Igreja Batista Vida Nova',
    logo: { path: '/logos/wide.png', width: 640, height: 200 },
    accent: '#1f3a5f',
  },
  'square-red': {
    churchName: 'Comunidade Cristã Esperança',
    logo: { path: '/logos/square.png', width: 300, height: 300 },
    accent: '#c0392b',
  },
  'dark-logo-pale-accent': {
    churchName: 'Igreja da Cruz',
    logo: { path: '/logos/dark-transparent.png', width: 400, height: 200 },
    accent: '#f6e7a1',
  },
  'name-only-long': {
    churchName:
      'Primeira Igreja Presbiteriana Independente de São José dos Campos',
    accent: '#2e7d32',
  },
};

export const APP_NAME = 'Church';
export const PLATFORM_LOGO: Logo = {
  path: '/logos/platform.png',
  width: 500,
  height: 500,
};
export const PLATFORM_SITE = 'https://example.com/church';
