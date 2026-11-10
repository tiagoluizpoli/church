import { overwriteGetLocale } from '@church/i18n/runtime';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentDetailPage } from '@/features/volunteers/components/assignment-detail-page';
import type { GetAssignmentDetail200 } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  getAssignmentDetail: vi.fn(),
  raiseSwapRequest: vi.fn(),
}));
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
  swapRequest: null,
};

beforeEach(() => {
  overwriteGetLocale(() => 'en');
  // Only Date is faked, so async queries and user events keep running.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T10:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
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

  it('links to the full Schedule', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    renderPage();
    const link = await screen.findByRole('link', { name: 'Full schedule' });
    expect(link).toHaveAttribute('href', '/my-schedule/kids/cycle-1');
  });

  it('opens the swap sheet with hint, prompt, limit and the stays-line, then sends', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    api.raiseSwapRequest.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ask to swap' }),
    );
    expect(
      screen.getByText(
        'Find someone to take your place first, then tell your leader who.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Who will take your place?')).toBeVisible();
    expect(screen.getByText('Optional · 0 / 500 characters')).toBeVisible();
    expect(
      screen.getByText('Your Assignment stays until your leader changes it.'),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Who will take your place?'), 'Joao');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(api.raiseSwapRequest).toHaveBeenCalledWith('a-1', {
        note: 'Joao',
      }),
    );
  });

  it('hides the entry once the Shift has started', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'));
    renderPage();
    await screen.findByRole('link', { name: 'Full schedule' });
    expect(
      screen.queryByRole('button', { name: 'Ask to swap' }),
    ).not.toBeInTheDocument();
  });

  it('shows the waiting state with the note and hides the entry while a request is open', async () => {
    api.getAssignmentDetail.mockResolvedValue({
      ...DETAIL,
      swapRequest: {
        id: 's-1',
        status: 'open',
        note: 'Joao will cover',
        reply: null,
        raisedAt: '2026-10-01T10:00:00.000Z',
      },
    });
    renderPage();
    expect(
      await screen.findByText('Swap requested · waiting for your leader'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your note: Joao will cover')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ask to swap' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['covered', null, 'Swap request covered · your leader made the change'],
    ['kept', 'Please stay', 'Swap request kept · your leader kept you on'],
    ['expired', null, 'Swap request expired · the Shift has started'],
  ] as const)('shows the %s state, with no note and no waiting line', async (status, reply, line) => {
    api.getAssignmentDetail.mockResolvedValue({
      ...DETAIL,
      swapRequest: {
        id: 's-1',
        status,
        note: 'Joao will cover',
        reply,
        raisedAt: '2026-10-01T10:00:00.000Z',
      },
    });
    renderPage();
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for your leader/)).toBeNull();
    expect(screen.queryByText(/Your note/)).toBeNull();
    if (reply)
      expect(
        screen.getByText(`Reply from your leader: ${reply}`),
      ).toBeInTheDocument();
  });

  it('offers Ask to swap again after a withdrawn request', async () => {
    api.getAssignmentDetail.mockResolvedValue({
      ...DETAIL,
      swapRequest: {
        id: 's-1',
        status: 'withdrawn',
        note: null,
        reply: null,
        raisedAt: '2026-10-01T10:00:00.000Z',
      },
    });
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Ask to swap' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Swap request/)).toBeNull();
  });

  it('shows the server message and refetches when the request is refused', async () => {
    api.getAssignmentDetail.mockResolvedValue(DETAIL);
    api.raiseSwapRequest.mockRejectedValue(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: {
          error: 'SWAP_REQUEST_SHIFT_STARTED',
          message: 'This Shift has already started.',
        },
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ask to swap' }),
    );
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText('This Shift has already started.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.getAssignmentDetail).toHaveBeenCalledTimes(2),
    );
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
