import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  listAvailabilityChecks: vi.fn(),
  getCallerCapabilities: vi.fn(),
  getVolunteerDashboard: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({
  volunteerApi: api,
  callerCapabilitiesApi: api,
}));

const CHECK: ListAvailabilityChecks200ChecksItem = {
  id: 'kids-check',
  cycleId: 'october',
  cycleName: 'Outubro 2026',
  ministryId: 'kids',
  ministryName: 'Infantil',
  state: 'pending',
  answerBy: '2026-10-01',
  totalShiftCount: 12,
  unavailableShiftCount: 3,
};

function renderPage(
  content = <AvailabilityListPage />,
  queryClient?: QueryClient,
) {
  const root = createRootRoute({
    component: () => (
      <CallerCapabilitiesScopeProvider churchId="church" userId="person">
        {content}
      </CallerCapabilitiesScopeProvider>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/availability/$checkId',
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return renderWithProviders(<RouterProvider router={router} />, {
    churchTimezone: 'America/Sao_Paulo',
    queryClient,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getCallerCapabilities.mockResolvedValue({
    churchId: 'church',
    isChurchAdmin: false,
    ledMinistries: [],
    hasVolunteerMembership: true,
  });
  api.listAvailabilityChecks.mockResolvedValue({ checks: [CHECK] });
  api.getVolunteerDashboard.mockReturnValue(new Promise(() => {}));
  setTestClock({ instant: parseInstant({ value: '2026-10-02T01:00:00Z' }) });
});

function mobileList() {
  return screen.getByTestId('data-table-mobile-list');
}

function desktopTable() {
  return screen.getByRole('grid', { name: m.nav_availability() });
}

describe('Availability checks list', () => {
  it('keeps the server order and shows each check as a mobile card and a desktop row', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [
        CHECK,
        {
          ...CHECK,
          id: 'music-check',
          ministryId: 'music',
          ministryName: 'Louvor',
          state: 'confirmed',
          unavailableShiftCount: 0,
        },
        {
          ...CHECK,
          id: 'next-check',
          state: 'confirmed',
          cycleName: 'Novembro 2026',
        },
      ],
    });
    renderPage();
    const cards = within(
      await screen.findByTestId('data-table-mobile-list'),
    ).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(
      within(cards[0]).getByRole('heading', {
        name: 'Infantil · Outubro 2026',
      }),
    ).toBeVisible();
    expect(
      within(cards[0]).getByText(m.availability_list_pending()),
    ).toBeVisible();
    expect(
      within(cards[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/availability/kids-check');
    expect(
      within(cards[1]).getByText(m.availability_detail_confirmed()),
    ).toBeVisible();
    expect(
      within(cards[1]).getByText(m.availability_list_available_all()),
    ).toBeVisible();
    expect(
      within(cards[1]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/availability/music-check');
    expect(
      within(cards[2]).getByText(
        m.availability_list_unavailable_count({ unavailable: 3, total: 12 }),
      ),
    ).toBeVisible();

    const rows = within(desktopTable()).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      'availability-check-kids-check',
      'availability-check-music-check',
      'availability-check-next-check',
    ]);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent(
      'Infantil',
    );
    expect(within(rows[0]).getByText('Outubro 2026')).toBeVisible();
    expect(
      within(rows[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_answer());
    expect(
      within(rows[1]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_review());
  });

  it('shows a confirmed check its met Deadline as a muted date, never as a call to answer', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, state: 'confirmed', answerBy: '2026-10-10' }],
    });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      screen.queryByText(m.availability_list_answer_by({ date: '10/10/2026' })),
    ).not.toBeInTheDocument();
    expect(within(mobileList()).queryByText('10/10/2026')).toBeNull();
    expect(within(desktopTable()).getByText('10/10/2026')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('keeps the Deadline current through its Church day even when UTC is tomorrow', async () => {
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      within(mobileList()).getByText(m.availability_list_due_today()),
    ).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_overdue({ date: '01/10/2026' })),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['2026-10-02', m.availability_list_due_tomorrow()],
    [
      '2026-10-04',
      m.availability_list_due_in_days({ date: '04/10/2026', days: 3 }),
    ],
  ])('marks a pending Deadline on %s as due soon in amber', async (answerBy, text) => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, answerBy }],
    });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(within(mobileList()).getByText(text).parentElement).toHaveClass(
      'text-yellow-700',
    );
    expect(within(desktopTable()).getByText(text)).toBeVisible();
  });

  it('keeps a pending Deadline beyond three days muted', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, answerBy: '2026-10-05' }],
    });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      within(mobileList()).getByText(
        m.availability_list_answer_by({ date: '05/10/2026' }),
      ).parentElement,
    ).toHaveClass('text-muted-foreground');
  });

  it('shows overdue once the Church CalendarDay passes the Deadline', async () => {
    setTestClock({ instant: parseInstant({ value: '2026-10-02T03:00:00Z' }) });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(
      within(mobileList()).getByText(
        m.availability_list_overdue({ date: '01/10/2026' }),
      ).parentElement,
    ).toHaveClass('text-destructive');
  });

  it('omits the Deadline when the leader has not set one', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, answerBy: null }],
    });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(document.querySelector('time')).toBeNull();
  });

  it('shows the localized empty state for a response without current checks', async () => {
    api.listAvailabilityChecks.mockResolvedValue({ checks: [] });
    renderPage();
    expect(await screen.findByText(m.availability_list_empty())).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows not-serving without requesting checks', async () => {
    api.getCallerCapabilities.mockResolvedValue({
      churchId: 'church',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    renderPage();
    expect(await screen.findByText(m.shell_not_serving())).toBeVisible();
    expect(api.listAvailabilityChecks).not.toHaveBeenCalled();
  });

  it('offers a localized retry after a failed list request', async () => {
    api.listAvailabilityChecks
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ checks: [CHECK] });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_list_error(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.schedules_retry() }),
    );
    expect(await screen.findByTestId('data-table-mobile-list')).toBeVisible();
  });

  it('shows loading while the API request is pending', async () => {
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      await screen.findByRole('status', {
        name: m.availability_list_loading(),
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(m.availability_list_empty()),
    ).not.toBeInTheDocument();
  });
});

describe('loading states', () => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    renderPage(undefined, new QueryClient());
    const region = await screen.findByRole('status', {
      name: m.availability_list_loading(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the shown data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    api.listAvailabilityChecks.mockResolvedValue({ checks: [CHECK] });
    renderPage(undefined, queryClient);
    expect(await screen.findByTestId('data-table-mobile-list')).toBeVisible();
    api.listAvailabilityChecks.mockClear();
    api.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.listAvailabilityChecks).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByTestId('data-table-mobile-list')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.availability_list_loading() }),
    ).toBeNull();
  });
});
