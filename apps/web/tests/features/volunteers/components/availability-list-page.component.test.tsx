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
import { act, screen, waitFor, within } from '@testing-library/react';
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
  const view = renderWithProviders(<RouterProvider router={router} />, {
    churchTimezone: 'America/Sao_Paulo',
    queryClient,
  });
  return { ...view, router };
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
  return screen.getByRole('grid', { name: m.availability_list_to_answer() });
}

describe('Availability checks list', () => {
  it('splits the server order into checks to answer and answered checks, as mobile cards and desktop rows', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [
        CHECK,
        { ...CHECK, id: 'kids-december', cycleName: 'Dezembro 2026' },
        {
          ...CHECK,
          id: 'music-check',
          ministryId: 'music',
          ministryName: 'Louvor',
          state: 'confirmed',
          confirmedAt: '2026-09-20T15:00:00Z',
          unavailableShiftCount: 0,
        },
        {
          ...CHECK,
          id: 'next-check',
          state: 'confirmed',
          confirmedAt: '2026-09-21T15:00:00Z',
          cycleName: 'Novembro 2026',
        },
      ],
    });
    renderPage();
    const [toAnswer, answered] = await screen.findAllByTestId(
      'data-table-mobile-list',
    );
    expect(
      screen.getByText(
        `${m.availability_list_pending_count({ count: 2 })} ${m.availability_list_description()}`,
      ),
    ).toBeVisible();
    expect(toAnswer).toHaveAccessibleName(m.availability_list_to_answer());
    expect(answered).toHaveAccessibleName(m.availability_list_answered());
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: m.availability_list_answered(),
      }),
    ).toBeVisible();

    const pendingCards = within(toAnswer).getAllByRole('listitem');
    expect(pendingCards.map((card) => card.dataset.testid)).toEqual([
      'availability-check-kids-check',
      'availability-check-kids-december',
    ]);
    expect(
      within(pendingCards[0]).getByRole('heading', {
        level: 3,
        name: 'Infantil',
      }),
    ).toBeVisible();
    expect(
      within(pendingCards[0]).getByText(
        `Outubro 2026 · ${m.availability_list_shift_count({ count: 12 })}`,
      ),
    ).toBeVisible();
    expect(
      within(pendingCards[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/availability/kids-check');

    const answeredCards = within(answered).getAllByRole('listitem');
    expect(answeredCards.map((card) => card.dataset.testid)).toEqual([
      'availability-check-music-check',
      'availability-check-next-check',
    ]);
    expect(
      within(answeredCards[0]).getByText(
        m.availability_list_available_count({ available: 12, total: 12 }),
      ),
    ).toBeVisible();
    expect(
      within(answeredCards[0]).getByText(
        m.availability_list_answered_on({ date: '20/09/2026' }),
      ),
    ).toBeVisible();
    expect(
      within(answeredCards[0]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveAttribute('href', '/availability/music-check');
    expect(
      within(answeredCards[1]).getByText(
        m.availability_list_available_count({ available: 9, total: 12 }),
      ),
    ).toBeVisible();

    const pendingRows = within(
      screen.getByRole('grid', { name: m.availability_list_to_answer() }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(pendingRows.map((row) => row.dataset.testid)).toEqual([
      'availability-check-kids-check',
      'availability-check-kids-december',
    ]);
    expect(within(pendingRows[0]).getByRole('rowheader')).toHaveTextContent(
      `Infantil · Outubro 2026 · ${m.availability_list_shift_count({ count: 12 })}`,
    );
    expect(
      within(pendingRows[0]).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_answer());

    const answeredGrid = screen.getByRole('grid', {
      name: m.availability_list_answered(),
    });
    expect(
      within(answeredGrid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      m.availability_list_column_ministry(),
      m.availability_list_column_answer(),
      m.availability_list_column_answered_on(),
      m.availability_list_column_actions(),
    ]);
    const answeredRows = within(answeredGrid).getAllByRole('row').slice(1);
    expect(answeredRows.map((row) => row.dataset.testid)).toEqual([
      'availability-check-music-check',
      'availability-check-next-check',
    ]);
    expect(within(answeredRows[0]).getByText('20/09/2026')).toHaveClass(
      'text-muted-foreground',
    );
    expect(
      within(answeredRows[0]).getByRole('link', {
        name: m.availability_list_review_label({
          name: 'Louvor · Outubro 2026',
        }),
      }),
    ).toHaveTextContent(m.availability_list_review());
  });

  it('opens a check from its desktop row with Enter', async () => {
    const { router } = renderPage();
    const grid = await screen.findByRole('grid', {
      name: m.availability_list_to_answer(),
    });
    const row = within(grid).getAllByRole('row')[1];
    act(() => row.focus());
    expect(row).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/availability/kids-check'),
    );
  });

  it('says every check is answered and shows no list to answer when none is pending', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [
        {
          ...CHECK,
          state: 'confirmed',
          totalShiftCount: 1,
          unavailableShiftCount: 1,
        },
      ],
    });
    renderPage();
    expect(
      await screen.findByText(m.availability_list_all_answered()),
    ).toBeVisible();
    expect(
      screen.queryByRole('grid', { name: m.availability_list_to_answer() }),
    ).toBeNull();
    expect(
      within(mobileList()).getByText(
        m.availability_list_available_count_one({ available: 0 }),
      ),
    ).toBeVisible();
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

  it('shows overdue once the Church CalendarDay passes the Deadline, still inviting an answer', async () => {
    setTestClock({ instant: parseInstant({ value: '2026-10-02T03:00:00Z' }) });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(m.availability_list_overdue({ date: '01/10/2026' })).toBe(
      'Prazo era 01/10/2026 · ainda dá tempo',
    );
    expect(
      within(mobileList()).getByText(
        m.availability_list_overdue({ date: '01/10/2026' }),
      ).parentElement,
    ).toHaveClass('text-destructive');
    expect(
      within(mobileList()).getByRole('link', {
        name: m.availability_list_answer_label({
          name: 'Infantil · Outubro 2026',
        }),
      }),
    ).toBeVisible();
  });

  it('says a check has no Deadline when the leader has not set one', async () => {
    api.listAvailabilityChecks.mockResolvedValue({
      checks: [{ ...CHECK, answerBy: null }],
    });
    renderPage();
    await screen.findByTestId('data-table-mobile-list');
    expect(document.querySelector('time')).toBeNull();
    expect(
      within(mobileList()).getByText(m.availability_list_no_deadline()),
    ).toHaveClass('text-muted-foreground');
    expect(
      within(desktopTable()).getByText(m.availability_list_no_deadline()),
    ).toBeVisible();
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
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(m.availability_list_error());
    expect(within(alert).getByText(m.availability_list_error())).toHaveClass(
      'text-destructive',
    );
    await userEvent.click(
      within(alert).getByRole('button', { name: m.common_retry() }),
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
