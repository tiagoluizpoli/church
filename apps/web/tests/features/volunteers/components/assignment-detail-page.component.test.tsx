import { overwriteGetLocale } from '@church/i18n/runtime';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentDetailPage } from '@/features/volunteers/components/assignment-detail-page';
import type { GetAssignmentDetail200 } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({ getAssignmentDetail: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ volunteerApi: api }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params = {},
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '')}>
      {children}
    </a>
  ),
}));

const DETAIL: GetAssignmentDetail200 = {
  assignmentId: 'a-1',
  eventId: 'e-1',
  eventTitle: 'Sunday Service',
  // 13:00Z is 10:00 in São Paulo, 12 Oct 2026 (a Monday).
  startTime: '2026-10-12T13:00:00.000Z',
  endTime: '2026-10-12T15:00:00.000Z',
  cycleId: 'cycle-1',
  ministryId: 'kids',
  ministryName: 'Kids',
  sectorName: 'Babies Room',
  roleName: 'Teacher',
  leaderName: 'Ana Leader',
  roster: [
    {
      sectorName: 'Babies Room',
      roleName: 'Teacher',
      people: [
        { name: 'Maria L.', isYou: true },
        { name: 'Joao P.', isYou: false },
      ],
      openCount: 1,
    },
  ],
};

beforeEach(() => {
  overwriteGetLocale(() => 'en');
});

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => 'en');
  vi.resetAllMocks();
});

function renderPage() {
  return renderWithProviders(<AssignmentDetailPage assignmentId="a-1" />, {
    churchTimezone: 'America/Sao_Paulo',
  });
}

describe('AssignmentDetailPage', () => {
  it('renders the facts in the Church Timezone, the roster, the highlight and Open', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    renderPage();
    expect(await screen.findByText('Mon 12 Oct · Kids')).toBeInTheDocument();
    expect(screen.getByText('12/10/2026 10:00 – 12:00')).toBeInTheDocument();
    expect(screen.getByText('Sunday Service')).toBeInTheDocument();
    expect(screen.getByText('Babies Room', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('Ana Leader')).toBeInTheDocument();
    expect(screen.getByText('Joao P.')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    const own = screen.getByText('Maria L.').closest('li');
    expect(own).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Joao P.').closest('li')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('links to the full Schedule and keeps need-help inert', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    renderPage();
    const link = await screen.findByRole('link', { name: 'Full schedule' });
    expect(link).toHaveAttribute('href', '/my-schedule/kids/cycle-1');
    expect(
      screen.getByRole('button', { name: 'I need help with this' }),
    ).toBeDisabled();
  });

  it('shows the stale-link message with a way back on 404', async () => {
    api.getAssignmentDetail.mockRejectedValue(
      new AxiosError('nf', '404', undefined, undefined, {
        status: 404,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    renderPage();
    expect(
      await screen.findByText('This assignment is no longer on your schedule.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to my schedule' }),
    ).toHaveAttribute('href', '/my-schedule');
  });

  it('renders in pt-BR', async () => {
    overwriteGetLocale(() => 'pt-BR');
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    renderPage();
    expect(
      await screen.findByRole('link', { name: 'Escala completa' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Em aberto')).toBeInTheDocument();
    expect(screen.getByText('Líder')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Você')).toBeInTheDocument());
  });

  it('pt-BR stale message', async () => {
    overwriteGetLocale(() => 'pt-BR');
    api.getAssignmentDetail.mockRejectedValue(
      new AxiosError('nf', '404', undefined, undefined, {
        status: 404,
        data: {},
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    renderPage();
    expect(
      await screen.findByText('Esta escala não faz mais parte da sua escala.'),
    ).toBeInTheDocument();
  });
});
