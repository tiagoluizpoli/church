import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';
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
    listSchedules: () => listSchedules(),
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

function renderPrepareIndex() {
  return renderRoute({
    initialPath: '/schedules',
    churchTimezone: 'UTC',
  });
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

beforeEach(() => {
  listSchedules.mockReset();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

describe('Schedules list', () => {
  it.each([
    { isChurchAdmin: true, ledMinistries: 0, ministries: 1, filter: true },
    { isChurchAdmin: false, ledMinistries: 1, ministries: 1, filter: false },
    { isChurchAdmin: false, ledMinistries: 2, ministries: 2, filter: true },
  ])('shows only the scoped rows with filter=$filter for admin=$isChurchAdmin and $ledMinistries led Ministries', async ({
    isChurchAdmin,
    ledMinistries,
    ministries,
    filter,
  }) => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ isChurchAdmin, ledMinistries }),
    );
    listSchedules.mockResolvedValue({
      schedules:
        ministries === 1
          ? [schedule()]
          : [
              schedule(),
              schedule({ ministry: { id: 'ministry-2', name: 'Worship' } }),
            ],
    });
    renderPrepareIndex();
    await screen.findByRole('link', { name: /Kids · Outubro/ });
    expect(screen.getAllByRole('link')).toHaveLength(ministries);
    if (filter)
      expect(
        await screen.findByRole('combobox', { name: m.schedules_filter() }),
      ).toBeVisible();
    else expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a late-mark count on the Schedule row', async () => {
    listSchedules.mockResolvedValue({
      schedules: [schedule({ lateMarkCount: 2 })],
    });
    renderPrepareIndex();
    const row = (
      await screen.findByRole('link', { name: /Kids · Outubro/ })
    ).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('⚠ 2');
    expect(
      within(row).getByLabelText(m.schedule_late_mark_count({ count: 2 })),
    ).toBeVisible();
  });

  it.each([
    { count: 1, label: m.schedules_swap_request_one() },
    { count: 3, label: m.schedules_swap_requests_other({ count: 3 }) },
  ])('adds "$label" beside the Published state', async ({ count, label }) => {
    listSchedules.mockResolvedValue({
      schedules: [
        schedule({ stage: 'published', openSwapRequestCount: count }),
      ],
    });
    renderPrepareIndex();
    const row = (
      await screen.findByRole('link', { name: /Kids · Outubro/ })
    ).closest('li') as HTMLElement;
    expect(row).toHaveTextContent(`${m.schedules_published()} · ${label}`);
  });

  it('opens a Schedule only through its explicit row-end Open link, never from ordinary row text', async () => {
    listSchedules.mockResolvedValue({ schedules: [schedule()] });
    const user = userEvent.setup();
    const { router } = renderPrepareIndex();
    const open = await screen.findByRole('link', {
      name: m.schedules_open_label({ name: 'Kids · Outubro 2026' }),
    });
    expect(open).toHaveTextContent(m.schedules_open());
    expect(open).toHaveClass('min-h-11');
    const item = open.closest('li') as HTMLElement;
    expect(open.parentElement).toHaveClass('justify-end');

    await user.click(within(item).getByText(/Kids · Outubro 2026/));
    expect(router.state.location.pathname).toBe('/schedules');
  });

  it('opens the selected Schedule directly on row activation', async () => {
    listSchedules.mockResolvedValue({ schedules: [schedule()] });
    listMinistries.mockResolvedValue({
      ministries: [
        { id: 'ministry-1', name: 'Kids', defaultDirection: 'all_out' },
      ],
    });
    getCycleParticipation.mockResolvedValue({ events: [] });
    const user = userEvent.setup();
    const { router } = renderPrepareIndex();
    await user.click(
      await screen.findByRole('link', { name: /Kids · Outubro/ }),
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
      .mockResolvedValue({ schedules: [schedule()] });
    const user = userEvent.setup();
    renderPrepareIndex();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.schedules_error(),
    );
    expect(screen.queryByText(m.schedules_empty())).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: m.schedules_retry() }));
    expect(
      await screen.findByRole('link', { name: /Kids · Outubro/ }),
    ).toBeVisible();
  });

  it('keeps loading distinct from an empty scoped result', async () => {
    let resolve!: (value: {
      schedules: ListSchedules200SchedulesItem[];
    }) => void;
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
    resolve({ schedules: [] });
    expect(await screen.findByText(m.schedules_empty())).toBeVisible();
  });

  it('lets a ChurchAdmin filter the scoped rows by Ministry and restore all rows', async () => {
    listSchedules.mockResolvedValue({
      schedules: [
        schedule(),
        schedule({ ministry: { id: 'ministry-2', name: 'Worship' } }),
      ],
    });
    const user = userEvent.setup();
    renderPrepareIndex();
    await screen.findByRole('link', { name: /Kids · Outubro/ });
    await user.click(
      screen.getByRole('combobox', { name: m.schedules_filter() }),
    );
    await user.click(await screen.findByRole('option', { name: 'Worship' }));
    expect(
      screen.queryByRole('link', { name: /Kids · Outubro/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Worship · Outubro/ }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('combobox', { name: m.schedules_filter() }),
    );
    await user.click(
      await screen.findByRole('option', { name: m.schedules_all_ministries() }),
    );
    expect(screen.getByRole('link', { name: /Kids · Outubro/ })).toBeVisible();
  });

  it('puts actionable Schedules before published and not-serving rows, with Past collapsed', async () => {
    listSchedules.mockResolvedValue({
      schedules: [
        schedule({
          ministry: { id: 'published', name: 'Published' },
          stage: 'published',
        }),
        schedule({
          ministry: { id: 'off', name: 'Off' },
          stage: 'not_serving',
        }),
        schedule({
          ministry: { id: 'assigning', name: 'Assign' },
          stage: 'assigning',
        }),
        schedule({
          ministry: { id: 'asking', name: 'Ask' },
          stage: 'asking',
          asking: { confirmed: 32, asked: 40 },
        }),
        schedule(),
        schedule({
          cycle: {
            id: 'past',
            name: 'Setembro 2026',
            startDate: '2026-09-01',
            endDate: '2026-09-30',
            state: 'past',
          },
          stage: 'published',
        }),
      ],
    });
    const user = userEvent.setup();
    renderPrepareIndex();
    await screen.findByRole('link', { name: /Kids · Outubro/ });
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining(m.schedules_to_prepare()),
      expect.stringContaining(m.schedules_asking({ confirmed: 32, asked: 40 })),
      expect.stringContaining(m.schedules_assigning()),
      expect.stringContaining(m.schedules_published()),
      expect.stringContaining(m.schedules_not_serving()),
    ]);
    expect(
      screen.queryByRole('link', { name: /Setembro/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: m.schedules_past() }));
    expect(
      await screen.findByRole('link', { name: /Kids · Setembro/ }),
    ).toBeVisible();
  });

  it('shows the scoped Schedule and its asking count without ChurchAdmin reads', async () => {
    listSchedules.mockResolvedValue({
      schedules: [
        {
          ministry: { id: 'ministry-1', name: 'Kids' },
          cycle: {
            id: 'cycle-1',
            name: 'Outubro 2026',
            startDate: '2026-10-01',
            endDate: '2026-10-31',
            state: 'sent',
          },
          stage: 'asking',
          asking: { confirmed: 32, asked: 40 },
        },
      ],
    });
    renderPrepareIndex();
    const row = await screen.findByRole('link', {
      name: /Kids · Outubro 2026/,
    });
    expect(row.closest('li')).toHaveTextContent('32/40');
    expect(row).toHaveAttribute('href', '/schedules/ministry-1/cycle-1');
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
