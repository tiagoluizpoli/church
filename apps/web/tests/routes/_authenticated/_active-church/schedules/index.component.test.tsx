import { m } from '@church/i18n/messages';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ListSchedules200,
  type ListSchedules200Counts,
  type ListSchedules200SchedulesItem,
  ListSchedulesStage,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const listSchedules = vi.fn();
const getCallerCapabilities = vi.fn();
const listMinistries = vi.fn();
const listCycles = vi.fn();
const listEvents = vi.fn();
const getCycleParticipation = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listSchedules: (...args: unknown[]) => listSchedules(...args),
    listScheduleSummaries: () =>
      Promise.resolve({
        cycles: [
          {
            cycleId: 'cycle-1',
            name: 'Outubro 2026',
            startDate: '2026-10-01',
            endDate: '2026-10-31',
            state: 'sent',
            eventCount: 0,
            eventTimeBlockCount: 0,
            includedEventTimeBlockCount: 0,
            shiftCount: 0,
            requirementCount: 0,
            preparingCount: 0,
            availabilityRequestedCount: 0,
            assigningCount: 0,
            publishedCount: 0,
          },
        ],
      }),
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listCycles: (...args: unknown[]) => listCycles(...args),
    listEvents: (...args: unknown[]) => listEvents(...args),
    getCycleParticipation: (...args: unknown[]) =>
      getCycleParticipation(...args),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: () => getCallerCapabilities(),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderPrepareIndex(initialPath = '/schedules') {
  return renderRoute({ initialPath, churchTimezone: 'UTC' });
}

function schedule(
  overrides: Partial<ListSchedules200SchedulesItem> = {},
): ListSchedules200SchedulesItem {
  return {
    affectedVolunteerCount: 0,
    ministry: { id: 'ministry-1', name: 'Kids' },
    cycle: {
      id: 'cycle-1',
      name: 'Outubro 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      state: 'sent',
    },
    stage: 'to_prepare',
    lateMarkCount: 0,
    openSwapRequestCount: 0,
    gapCount: 0,
    ...overrides,
  };
}

const KIDS = { id: 'ministry-1', name: 'Kids' };
const WORSHIP = { id: '6f1c2b8e-4a5d-4c3b-9e7f-1a2b3c4d5e6f', name: 'Worship' };

/** Stage names are the wire keys, in to_prepare … not_serving order. */
function stageCounts(values: number[]): ListSchedules200Counts {
  const stages = Object.values(ListSchedulesStage);
  return Object.fromEntries(
    stages.map((stage, index) => [stage, values[index] ?? 0]),
  ) as ListSchedules200Counts;
}

/** One server page: the server owns order, counts and pickers. */
function page(
  schedules: ListSchedules200SchedulesItem[],
  overrides: Partial<ListSchedules200> = {},
): ListSchedules200 {
  return {
    schedules,
    counts: stageCounts([0, 0, 0, 0, 0]),
    options: { ministries: [KIDS, WORSHIP] },
    ...overrides,
  };
}

beforeEach(() => {
  listSchedules.mockReset();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

async function scheduleList() {
  return within(await screen.findByRole('list', { name: m.schedules_title() }));
}

async function scheduleItem(name: RegExp) {
  return (await scheduleList())
    .getByRole('link', { name })
    .closest('[role="listitem"]') as HTMLElement;
}

async function choose(combobox: string, option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: combobox }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('Schedules list', () => {
  it.each([
    { isChurchAdmin: true, ministries: [KIDS], filter: true },
    { isChurchAdmin: false, ministries: [KIDS], filter: false },
    { isChurchAdmin: false, ministries: [KIDS, WORSHIP], filter: true },
  ])('offers the Ministry filter=$filter for admin=$isChurchAdmin from the server options', async ({
    isChurchAdmin,
    ministries,
    filter,
  }) => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({
        isChurchAdmin,
        ledMinistries: isChurchAdmin ? 0 : ministries.length,
      }),
    );
    listSchedules.mockResolvedValue(
      page([schedule()], { options: { ministries } }),
    );
    renderPrepareIndex();
    expect((await scheduleList()).getAllByRole('link')).toHaveLength(1);
    if (filter)
      expect(
        await screen.findByRole('combobox', { name: m.schedules_filter() }),
      ).toBeVisible();
    else
      expect(
        screen.queryByRole('combobox', { name: m.schedules_filter() }),
      ).not.toBeInTheDocument();
  });

  it('shows the server stage counts in the header', async () => {
    listSchedules.mockResolvedValue(
      page([schedule()], {
        counts: stageCounts([2, 0, 1, 4, 3]),
      }),
    );
    renderPrepareIndex();
    expect(
      await screen.findByTestId('schedules-to-prepare-chip'),
    ).toHaveTextContent('2');
    expect(screen.getByTestId('schedules-asking-chip')).toHaveTextContent('0');
    expect(screen.getByTestId('schedules-assigning-chip')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('schedules-published-chip')).toHaveTextContent(
      '4',
    );
  });

  it('keeps the rows in server order', async () => {
    listSchedules.mockResolvedValue(
      page([
        schedule({ ministry: { id: 'p', name: 'Pub' }, stage: 'published' }),
        schedule({ ministry: { id: 'o', name: 'Off' }, stage: 'not_serving' }),
        schedule({ ministry: { id: 'a', name: 'Ask' }, stage: 'asking' }),
      ]),
    );
    renderPrepareIndex();
    expect(
      (await scheduleList())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Pub'),
      expect.stringContaining('Off'),
      expect.stringContaining('Ask'),
    ]);
  });

  it('shows a late-mark count on the Schedule row', async () => {
    listSchedules.mockResolvedValue(page([schedule({ lateMarkCount: 2 })]));
    renderPrepareIndex();
    const row = await scheduleItem(/Kids · Outubro/);
    expect(row).toHaveTextContent('⚠ 2');
    expect(
      within(row).getByLabelText(m.schedule_late_mark_count({ count: 2 })),
    ).toBeVisible();
  });

  it.each([
    { count: 1, label: m.schedules_swap_request_one() },
    { count: 3, label: m.schedules_swap_requests_other({ count: 3 }) },
  ])('adds "$label" beside the Published state', async ({ count, label }) => {
    listSchedules.mockResolvedValue(
      page([schedule({ stage: 'published', openSwapRequestCount: count })]),
    );
    renderPrepareIndex();
    const row = await scheduleItem(/Kids · Outubro/);
    expect(row).toHaveTextContent(`${m.schedules_published()} · ${label}`);
  });

  it('opens a Schedule only through its explicit Open link, never from ordinary row text', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    const user = userEvent.setup();
    const { router } = renderPrepareIndex();
    const list = await scheduleList();
    const open = list.getByRole('link', {
      name: m.schedules_open_label({ name: 'Kids · Outubro 2026' }),
    });
    expect(open).toHaveTextContent(m.schedules_open());
    expect(open).toHaveClass('min-h-11');

    await user.click(list.getByText('Kids'));
    expect(router.state.location.pathname).toBe('/schedules');
  });

  it('opens the selected Schedule directly on row activation', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });
    getCycleParticipation.mockResolvedValue({ events: [] });
    const user = userEvent.setup();
    const { router } = renderPrepareIndex();
    await user.click(
      (await scheduleList()).getByRole('link', { name: /Kids · Outubro/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/schedules/ministry-1/cycle-1',
      ),
    );
  });

  it.each([
    { status: 403, message: () => m.shell_no_access() },
    { status: 404, message: () => m.error_not_found() },
  ])('shows a distinct translated refusal for HTTP $status instead of an empty list', async ({
    status,
    message,
  }) => {
    listSchedules.mockRejectedValue({
      isAxiosError: true,
      response: { status },
    });
    renderPrepareIndex();
    expect(await screen.findByText(message())).toBeVisible();
    expect(screen.queryByText(m.schedules_empty())).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.schedules_retry() }),
    ).not.toBeInTheDocument();
  });

  it('keeps a failed read distinct from empty and retries into the real list', async () => {
    listSchedules
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(page([schedule()]));
    const user = userEvent.setup();
    renderPrepareIndex();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.schedules_error(),
    );
    expect(screen.queryByText(m.schedules_empty())).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: m.schedules_retry() }));
    expect(
      (await scheduleList()).getByRole('link', { name: /Kids · Outubro/ }),
    ).toBeInTheDocument();
  });

  it('keeps loading distinct from an empty scoped result', async () => {
    let resolve!: (value: ListSchedules200) => void;
    listSchedules.mockReturnValue(
      new Promise((result) => {
        resolve = result;
      }),
    );
    renderPrepareIndex();
    expect(await screen.findByRole('status')).toHaveTextContent(
      m.schedules_loading(),
    );
    expect(screen.queryByText(m.schedules_empty())).not.toBeInTheDocument();
    resolve(page([]));
    expect(await screen.findByText(m.schedules_empty())).toBeVisible();
  });

  it('asks the server for one Ministry and keeps the choice in the URL', async () => {
    listSchedules.mockImplementation((params?: { ministryId?: string }) =>
      Promise.resolve(
        page(
          params?.ministryId === WORSHIP.id
            ? [schedule({ ministry: WORSHIP })]
            : [schedule(), schedule({ ministry: WORSHIP })],
        ),
      ),
    );
    const { router } = renderPrepareIndex();
    await scheduleList();
    await choose(m.schedules_filter(), 'Worship');
    await waitFor(() =>
      expect(
        (screen.getByRole('list', { name: m.schedules_title() }) as HTMLElement)
          .textContent,
      ).not.toContain('Kids'),
    );
    expect(listSchedules).toHaveBeenLastCalledWith({ ministryId: WORSHIP.id });
    expect(router.state.location.search).toEqual({ ministryId: WORSHIP.id });
    await choose(m.schedules_filter(), m.schedules_all_ministries());
    expect(
      (await scheduleList()).getByRole('link', { name: /Kids · Outubro/ }),
    ).toBeVisible();
    expect(listSchedules).toHaveBeenLastCalledWith({});
  });

  it('asks the server for the trimmed search only once typing pauses for 300 ms', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    const { router } = renderPrepareIndex();
    await scheduleList();
    const before = listSchedules.mock.calls.length;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(
        screen.getByRole('searchbox', { name: m.schedules_filter_search() }),
        { target: { value: ' wor ' } },
      );
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(router.state.location.search).toEqual({});
      expect(listSchedules).toHaveBeenCalledTimes(before);
      await act(() => vi.advanceTimersByTimeAsync(1));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ search: 'wor' }),
    );
    await waitFor(() =>
      expect(listSchedules.mock.calls.slice(before)).toEqual([
        [{ search: 'wor' }],
      ]),
    );
  });

  it('commits the search at once on submit and drops it from the URL when cleared', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    const { router } = renderPrepareIndex('/schedules?search=kids');
    await scheduleList();
    const search = screen.getByRole('searchbox', {
      name: m.schedules_filter_search(),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(search, { target: { value: 'wor' } });
      fireEvent.submit(
        screen.getByRole('form', { name: m.schedules_filters_label() }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(router.state.location.search).toEqual({ search: 'wor' });
      fireEvent.change(search, { target: { value: '' } });
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(router.state.location.search).toEqual({ search: 'wor' });
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(router.state.location.search).toEqual({});
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(listSchedules).toHaveBeenLastCalledWith({}));
    expect(listSchedules).toHaveBeenCalledWith({ search: 'wor' });
  });

  it('debounces the search, combines it with the status, and clears back to the unfiltered read', async () => {
    listSchedules.mockImplementation(
      (params?: { search?: string; stage?: string }) =>
        Promise.resolve(
          page(
            params?.stage
              ? []
              : params?.search
                ? [schedule({ ministry: WORSHIP })]
                : [schedule(), schedule({ ministry: WORSHIP })],
          ),
        ),
    );
    const user = userEvent.setup();
    renderPrepareIndex();
    await scheduleList();
    await user.type(
      screen.getByRole('searchbox', { name: m.schedules_filter_search() }),
      'wor',
    );
    await waitFor(() =>
      expect(listSchedules).toHaveBeenLastCalledWith({ search: 'wor' }),
    );
    expect(
      listSchedules.mock.calls.filter(([params]) => params?.search),
    ).toHaveLength(1);
    await choose(m.schedules_filter_status(), m.schedules_assigning());
    expect(await screen.findByText(m.schedules_empty_filtered())).toBeVisible();
    expect(listSchedules).toHaveBeenLastCalledWith({
      search: 'wor',
      stage: 'assigning',
    });
    await user.click(
      screen.getByRole('button', { name: m.invitations_clear_filters() }),
    );
    expect((await scheduleList()).getAllByRole('link')).toHaveLength(2);
    expect(listSchedules).toHaveBeenLastCalledWith({});
  });

  it('asks the server for the Schedules needing attention, keeps it in the URL, and swaps it with a stage', async () => {
    listSchedules.mockImplementation((params?: { attention?: string }) =>
      Promise.resolve(page(params?.attention ? [] : [schedule()])),
    );
    const user = userEvent.setup();
    const { router } = renderPrepareIndex('/schedules?stage=asking');
    await scheduleList();
    await choose(
      m.schedules_filter_status(),
      m.schedules_filter_needs_attention(),
    );
    expect(await screen.findByText(m.schedules_empty_filtered())).toBeVisible();
    expect(listSchedules).toHaveBeenLastCalledWith({ attention: 'true' });
    expect(router.state.location.search).toEqual({ attention: true });
    expect(router.state.location.searchStr).toBe('?attention=true');

    await choose(m.schedules_filter_status(), m.schedules_assigning());
    await waitFor(() =>
      expect(listSchedules).toHaveBeenLastCalledWith({ stage: 'assigning' }),
    );
    expect(router.state.location.search).toEqual({ stage: 'assigning' });

    await choose(
      m.schedules_filter_status(),
      m.schedules_filter_needs_attention(),
    );
    await user.click(
      await screen.findByRole('button', {
        name: m.invitations_clear_filters(),
      }),
    );
    expect((await scheduleList()).getAllByRole('link')).toHaveLength(1);
    expect(listSchedules).toHaveBeenLastCalledWith({});
    expect(router.state.location.search).toEqual({});
  });

  it('reads the attention filter from the URL', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    renderPrepareIndex('/schedules?attention=true');
    await scheduleList();
    expect(listSchedules).toHaveBeenLastCalledWith({ attention: 'true' });
    expect(
      screen.getByRole('combobox', { name: m.schedules_filter_status() }),
    ).toHaveTextContent(m.schedules_filter_needs_attention());
  });

  it('reads the filters from the URL and asks for Past Schedules through the Period filter', async () => {
    listSchedules.mockResolvedValue(page([schedule()]));
    renderPrepareIndex('/schedules?stage=asking');
    await scheduleList();
    expect(listSchedules).toHaveBeenLastCalledWith({ stage: 'asking' });
    await choose(m.schedules_filter_period(), m.schedules_past());
    await waitFor(() =>
      expect(listSchedules).toHaveBeenLastCalledWith({
        stage: 'asking',
        period: 'past',
      }),
    );
  });

  it('loads the next page through its cursor and appends it', async () => {
    listSchedules.mockImplementation((params?: { cursor?: string }) =>
      Promise.resolve(
        params?.cursor === 'next'
          ? page([schedule({ ministry: WORSHIP })])
          : page([schedule()], { nextCursor: 'next' }),
      ),
    );
    const user = userEvent.setup();
    renderPrepareIndex();
    await scheduleList();
    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );
    await waitFor(async () =>
      expect((await scheduleList()).getAllByRole('link')).toHaveLength(2),
    );
    expect(listSchedules).toHaveBeenLastCalledWith({ cursor: 'next' });
    expect(
      screen.queryByRole('button', { name: m.invitations_load_more() }),
    ).not.toBeInTheDocument();
  });

  it('shows the scoped Schedule and its asking count without ChurchAdmin reads', async () => {
    listSchedules.mockResolvedValue(
      page([
        schedule({ stage: 'asking', asking: { confirmed: 32, asked: 40 } }),
      ]),
    );
    renderPrepareIndex();
    const row = await scheduleItem(/Kids · Outubro 2026/);
    expect(row).toHaveTextContent('32/40');
    expect(
      within(row).getByRole('link', { name: /Kids · Outubro 2026/ }),
    ).toHaveAttribute('href', '/schedules/ministry-1/cycle-1');
    expect(listCycles).not.toHaveBeenCalled();
    expect(listEvents).not.toHaveBeenCalled();
  });
});

describe('Cycle-ready picker entry (N2)', () => {
  const pickerPath =
    '/schedules?cycleId=cycle-9&ministryIds=ministry-1,ministry-3';

  it('lists only the named Ministries the caller still leads and keeps the Cycle on selection', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
        { id: 'ministry-2', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });
    renderRoute({
      initialPath: pickerPath,
      churchTimezone: 'UTC',
    });

    const open = await screen.findByRole('link', {
      name: m.prepare_cycle_picker_open({ ministryName: 'Greeters' }),
    });
    expect(screen.getByTestId('cycle-prepare-picker')).toHaveTextContent(
      m.prepare_cycle_picker_title(),
    );
    // Kids was not named; ministry-3 is no longer led.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(listCycles).not.toHaveBeenCalled();

    // The destination keeps the Cycle and checks access itself.
    expect(open).toHaveAttribute('href', '/schedules/ministry-1/cycle-9');
  });

  it('says so when the caller no longer leads any named Ministry', async () => {
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-2', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });

    renderRoute({ initialPath: pickerPath, churchTimezone: 'UTC' });

    expect(
      await screen.findByText(m.prepare_cycle_picker_empty()),
    ).toBeVisible();
  });

  it('offers a retry after a failed load', async () => {
    listMinistries.mockRejectedValueOnce(new Error('network'));
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Greeters', defaultDirection: 'all_out' },
      ],
    });
    const user = userEvent.setup();
    renderRoute({ initialPath: pickerPath, churchTimezone: 'UTC' });

    await user.click(
      await screen.findByRole('button', {
        name: m.prepare_cycle_picker_retry(),
      }),
    );

    expect(
      await screen.findByRole('link', {
        name: m.prepare_cycle_picker_open({ ministryName: 'Greeters' }),
      }),
    ).toBeVisible();
  });
});
