import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityDetailPage } from '@/features/volunteers/components/availability-detail-page';
import { useLocalAvailabilityDraft } from '@/features/volunteers/hooks/use-local-availability-draft';
import * as unavailableShifts from '@/features/volunteers/lib/unavailable-shifts';
import type { GetAvailabilityCheck200 } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  getAvailabilityCheck: vi.fn(),
  answerAvailabilityCheck: vi.fn(),
  getCallerCapabilities: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({
  volunteerApi: api,
  callerCapabilitiesApi: api,
}));

const CHECK: GetAvailabilityCheck200 = {
  id: 'check-1',
  cycleId: 'cycle-1',
  cycleName: 'Outubro 2026',
  ministryId: 'kids',
  ministryName: 'Kids',
  state: 'pending',
  answerBy: '2026-10-01',
  readOnly: false,
  // The backend sends Shifts in start-time order.
  shifts: [
    {
      shiftId: 'morning',
      eventId: 'event-2',
      eventTitle: 'Culto da manhã',
      label: 'Bebês',
      startTime: '2026-10-04T12:00:00Z',
      endTime: '2026-10-04T14:00:00Z',
      available: true,
      published: false,
      assigned: false,
    },
    {
      shiftId: 'evening',
      eventId: 'event-1',
      eventTitle: 'Culto à noite',
      label: 'Recepção',
      startTime: '2026-10-05T01:00:00Z',
      endTime: '2026-10-05T02:00:00Z',
      available: true,
      published: false,
      assigned: false,
    },
    {
      shiftId: 'next-day',
      eventId: 'event-3',
      eventTitle: 'Encontro',
      startTime: '2026-10-05T12:00:00Z',
      endTime: '2026-10-05T14:00:00Z',
      available: true,
      published: false,
      assigned: false,
    },
  ],
};

const SUNDAY = 'Domingo, 04/10/2026';
const MONDAY = 'Segunda-feira, 05/10/2026';
const allUnavailable = (day: string) =>
  m.availability_detail_day_all_unavailable({ day });
const allAvailable = (day: string) =>
  m.availability_detail_day_all_available({ day });

async function stayOnLeave() {
  const dialog = await screen.findByRole('alertdialog', {
    name: m.availability_leave_title(),
  });
  await userEvent.click(
    within(dialog).getByRole('button', { name: m.availability_leave_stay() }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
}

const histories: ReturnType<typeof createBrowserHistory>[] = [];
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});

function renderPage(
  onAnswered = vi.fn(),
  person = 'person',
  checkId = 'check-1',
  browser = false,
  queryClient?: QueryClient,
) {
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/availability/$checkId',
    component: () => (
      <CallerCapabilitiesScopeProvider churchId="church" userId={person}>
        <AvailabilityDetailPage checkId={checkId} onAnswered={onAnswered} />
      </CallerCapabilitiesScopeProvider>
    ),
  });
  const away = createRoute({
    getParentRoute: () => root,
    path: '/availability',
    component: () => <p>Away</p>,
  });
  window.history.replaceState(null, '', `/availability/${checkId}`);
  const history = browser
    ? createBrowserHistory()
    : createMemoryHistory({ initialEntries: [`/availability/${checkId}`] });
  histories.push(history);
  const router = createRouter({
    routeTree: root.addChildren([page, away]),
    history,
  });
  return {
    ...renderWithProviders(<RouterProvider router={router} />, {
      churchTimezone: 'America/Sao_Paulo',
      queryClient,
    }),
    router,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.getCallerCapabilities.mockResolvedValue({
    churchId: 'church',
    isChurchAdmin: false,
    ledMinistries: [],
    hasVolunteerMembership: true,
  });
  api.getAvailabilityCheck.mockResolvedValue(CHECK);
  setTestClock({ instant: parseInstant({ value: '2026-10-02T01:00:00Z' }) });
});

describe('Availability check page', () => {
  it('starts unconfirmed with individually named available switches on', async () => {
    renderPage();
    expect(await screen.findByText('Não confirmada')).toBeVisible();
    expect(
      screen.getByRole('switch', { name: /disponibilidade.*culto da manhã/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Enviar resposta' }),
    ).toBeEnabled();
    expect(api.answerAvailabilityCheck).not.toHaveBeenCalled();
  });

  it('counts open days and available Shifts in the header and follows each toggle', async () => {
    const user = userEvent.setup();
    renderPage();
    const openDays = await screen.findByTestId('availability-open-days-chip');
    const available = screen.getByTestId('availability-available-shifts-chip');
    expect(openDays).toHaveTextContent('Dias em aberto2');
    expect(available).toHaveTextContent('Turnos disponíveis3/3');
    expect(
      screen.queryByTestId('availability-past-days-chip'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('availability-published-days-chip'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('switch', { name: /disponibilidade.*culto da manhã/i }),
    );

    expect(available).toHaveTextContent('Turnos disponíveis2/3');
  });

  it('reaches a named Shift switch and confirms using the keyboard', async () => {
    const user = userEvent.setup();
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    const shift = await screen.findByRole('switch', {
      name: 'Disponibilidade: Culto da manhã, 04/10/2026 09:00 – 11:00',
    });
    expect(shift).toHaveAccessibleDescription('Bebês');
    for (let i = 0; i < 20 && document.activeElement !== shift; i++)
      await user.tab();
    expect(shift).toHaveFocus();
    expect(shift).toBeChecked();
    await user.keyboard(' ');
    expect(shift).not.toBeChecked();
    const confirm = screen.getByRole('button', {
      name: m.availability_detail_confirm(),
    });
    for (let i = 0; i < 20 && document.activeElement !== confirm; i++)
      await user.tab();
    expect(confirm).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning'],
      wholeDayDates: [],
    });
  });

  it('avoids repeated baseline and storage work on unrelated renders and persists edits after clear', () => {
    const baseline = vi.spyOn(
      unavailableShifts,
      'createInitialUnavailableShiftDraft',
    );
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const removals = vi.spyOn(Storage.prototype, 'removeItem');
    const input = {
      check: CHECK,
      userId: 'person',
      timeZone: 'America/Sao_Paulo',
      hasFreshDetail: true,
    };
    const { result, rerender } = renderHook(() =>
      useLocalAvailabilityDraft(input),
    );
    const initialBaseline = baseline.mock.calls.length;
    const initialStorage =
      writes.mock.calls.length + removals.mock.calls.length;
    rerender();
    rerender();
    expect(baseline).toHaveBeenCalledTimes(initialBaseline);
    expect(writes.mock.calls.length + removals.mock.calls.length).toBe(
      initialStorage,
    );

    act(() =>
      result.current.setDraft((draft) =>
        unavailableShifts.toggleShiftUnavailable({
          draft,
          shifts: CHECK.shifts,
          shiftId: 'morning',
          timeZone: input.timeZone,
        }),
      ),
    );
    expect(localStorage.getItem('availability-draft:person:check-1')).toBe(
      '["morning"]',
    );
    act(() => result.current.clear());
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
    act(() => result.current.setDraft((draft) => draft));
    expect(localStorage.getItem('availability-draft:person:check-1')).toBe(
      '["morning"]',
    );
  });

  it('recomputes Church CalendarDays when timezone changes and tolerates storage failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    const check = {
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'evening',
      })),
    };
    const { result, rerender } = renderHook(
      ({ timeZone }) =>
        useLocalAvailabilityDraft({
          check,
          userId: 'person',
          timeZone,
          hasFreshDetail: true,
        }),
      { initialProps: { timeZone: 'America/Sao_Paulo' } },
    );
    expect(result.current.draft.wholeDayDates.has('2026-10-04')).toBe(false);
    rerender({ timeZone: 'UTC' });
    expect(result.current.draft.wholeDayDates.has('2026-10-05')).toBe(false);
    act(() =>
      result.current.setDraft((draft) =>
        unavailableShifts.toggleShiftUnavailable({
          draft,
          shifts: check.shifts,
          shiftId: 'next-day',
          timeZone: 'UTC',
        }),
      ),
    );
    expect(result.current.draft.wholeDayDates.has('2026-10-05')).toBe(true);
    expect(result.current.hasUnsentChanges).toBe(true);
    act(() => result.current.discard());
    expect(result.current.hasUnsentChanges).toBe(false);
  });

  it('preserves a stored mark matching cached unavailable detail until delayed fresh available detail arrives', async () => {
    const storageKey = 'availability-draft:person:check-1';
    localStorage.setItem(storageKey, '["morning"]');
    const cached = {
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], cached);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    const { router } = renderPage(
      vi.fn(),
      'person',
      'check-1',
      true,
      queryClient,
    );
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).not.toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe('["morning"]');
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    const pendingClose = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pendingClose);
    expect(pendingClose.defaultPrevented).toBe(true);
    await act(async () => resolveDetail(CHECK));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(toggles[0]).not.toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe('["morning"]');
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    await stayOnLeave();
    expect(router.state.location.pathname).toBe('/availability/check-1');
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning'],
      wholeDayDates: [],
    });
  });

  it('preserves a stored empty removal matching cached available detail until delayed fresh unavailable detail arrives', async () => {
    const storageKey = 'availability-draft:person:check-1';
    localStorage.setItem(storageKey, '[]');
    const cached = {
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], CHECK);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    const { router } = renderPage(
      vi.fn(),
      'person',
      'check-1',
      true,
      queryClient,
    );
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe('[]');
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    const pendingClose = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pendingClose);
    expect(pendingClose.defaultPrevented).toBe(true);
    await act(async () => resolveDetail(cached));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(toggles[0]).toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe('[]');
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    await stayOnLeave();
    expect(router.state.location.pathname).toBe('/availability/check-1');
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: [],
      wholeDayDates: [],
    });
  });

  it('persists edits during delayed restoration and preserves later edits across another fresh response', async () => {
    const storageKey = 'availability-draft:person:check-1';
    localStorage.setItem(storageKey, '["morning"]');
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], {
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    });
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(vi.fn(), 'person', 'check-1', false, queryClient);
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(toggles[2]);
    expect(localStorage.getItem(storageKey)).toBe('["morning","next-day"]');
    await act(async () => resolveDetail(CHECK));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(toggles[0]).not.toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    await userEvent.click(toggles[1]);
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        eventTitle: 'Updated event',
      })),
    });
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: ['availability-check', 'check-1'],
      }),
    );
    await screen.findAllByText('Updated event');
    for (const toggle of toggles) expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(storageKey)).toBe(
      '["morning","evening","next-day"]',
    );
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning', 'evening', 'next-day'],
      wholeDayDates: ['2026-10-04', '2026-10-05'],
    });
  });

  it('clears matching restored intent only after an unchanged fresh response establishes the baseline', async () => {
    const storageKey = 'availability-draft:person:check-1';
    localStorage.setItem(storageKey, '[]');
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], CHECK);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    renderPage(vi.fn(), 'person', 'check-1', true, queryClient);
    await screen.findByText(m.availability_draft_restored());
    expect(localStorage.getItem(storageKey)).toBe('[]');
    await act(async () => resolveDetail(CHECK));
    await waitFor(() => expect(localStorage.getItem(storageKey)).toBeNull());
    expect(
      screen.queryByText(m.availability_draft_restored()),
    ).not.toBeInTheDocument();
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(false);
    for (const toggle of screen.getAllByRole('switch'))
      expect(toggle).toBeChecked();
  });

  it('reconciles a restored whole day after cached detail refetches without marking a newly added Shift', async () => {
    localStorage.setItem(
      'availability-draft:person:check-1',
      '["morning", "evening"]',
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], CHECK);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(vi.fn(), 'person', 'check-1', false, queryClient);
    expect(
      await screen.findByRole('button', { name: allAvailable(SUNDAY) }),
    ).toBeVisible();
    await act(async () =>
      resolveDetail({
        ...CHECK,
        // Same start as the morning Shift; the backend breaks the tie by id.
        shifts: [
          {
            ...CHECK.shifts[0],
            shiftId: 'added',
            eventTitle: 'Added service',
          },
          ...CHECK.shifts,
        ],
      }),
    );
    await screen.findByText('Added service');
    expect(
      screen.getByRole('button', { name: allUnavailable(SUNDAY) }),
    ).toBeVisible();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning', 'evening'],
      wholeDayDates: [],
    });
  });

  it('preserves in-session edits while refetch prunes removed and published marks and updates untouched rows', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], CHECK);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(vi.fn(), 'person', 'check-1', false, queryClient);
    await userEvent.click(
      await screen.findByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    await userEvent.click(screen.getByRole('switch', { name: /encontro/i }));
    await act(async () =>
      resolveDetail({
        ...CHECK,
        shifts: [
          { ...CHECK.shifts[0], shiftId: 'added', eventTitle: 'Added service' },
          { ...CHECK.shifts[1], published: true },
          CHECK.shifts[2],
        ],
      }),
    );
    await screen.findByText('Added service');
    expect(screen.queryByText('Culto da manhã')).not.toBeInTheDocument();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(
      screen.getByText(m.availability_detail_locked_unassigned()),
    ).toBeVisible();
    // Only one editable Shift is left on Sunday, so no whole-day control.
    expect(
      screen.queryByRole('button', { name: allUnavailable(SUNDAY) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: allAvailable(SUNDAY) }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['next-day'],
      wholeDayDates: ['2026-10-05'],
    });
    expect(localStorage.getItem('availability-draft:person:check-1')).toBe(
      '["next-day"]',
    );
  });

  it('follows refreshed server marks when the cached draft is untouched without inventing unsent changes', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['availability-check', 'check-1'], CHECK);
    let resolveDetail!: (check: GetAvailabilityCheck200) => void;
    api.getAvailabilityCheck.mockReturnValue(
      new Promise<GetAvailabilityCheck200>((resolve) => {
        resolveDetail = resolve;
      }),
    );
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(vi.fn(), 'person', 'check-1', false, queryClient);
    await screen.findByText('Kids · Outubro 2026');
    await act(async () =>
      resolveDetail({
        ...CHECK,
        shifts: CHECK.shifts.map((shift) => ({
          ...shift,
          available: shift.shiftId !== 'morning',
        })),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('switch', {
          name: /disponibilidade:/i,
        })[0],
      ).not.toBeChecked(),
    );
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(false);
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning'],
      wholeDayDates: [],
    });
  });

  it('keeps local additions and removals across repeated refetches while untouched rows follow the server', async () => {
    const queryClient = new QueryClient();
    const initial = {
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    };
    api.getAvailabilityCheck.mockResolvedValue(initial);
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(vi.fn(), 'person', 'check-1', false, queryClient);
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(toggles[0]);
    await userEvent.click(toggles[2]);
    api.getAvailabilityCheck.mockResolvedValue({
      ...initial,
      shifts: initial.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId === 'next-day',
      })),
    });
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: ['availability-check', 'check-1'],
      }),
    );
    expect(toggles[0]).toBeChecked();
    await waitFor(() => expect(toggles[1]).not.toBeChecked());
    expect(toggles[2]).not.toBeChecked();
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: ['availability-check', 'check-1'],
      }),
    );
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['evening', 'next-day'],
      wholeDayDates: ['2026-10-05'],
    });
  });

  it('persists each toggle across a reload without leaking to another Person or check', async () => {
    const first = renderPage();
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(toggles[0]);
    expect(
      JSON.parse(
        localStorage.getItem('availability-draft:person:check-1') ?? 'null',
      ),
    ).toEqual(['morning']);
    first.unmount();
    const restored = renderPage();
    expect(
      (
        await screen.findAllByRole('switch', {
          name: /disponibilidade:/i,
        })
      )[0],
    ).not.toBeChecked();
    restored.unmount();
    const anotherPerson = renderPage(vi.fn(), 'other-person');
    expect(
      (
        await screen.findAllByRole('switch', {
          name: /disponibilidade:/i,
        })
      )[0],
    ).toBeChecked();
    anotherPerson.unmount();
    api.getAvailabilityCheck.mockResolvedValue({ ...CHECK, id: 'other-check' });
    renderPage(vi.fn(), 'person', 'other-check');
    expect(
      (
        await screen.findAllByRole('switch', {
          name: /disponibilidade:/i,
        })
      )[0],
    ).toBeChecked();
    expect(localStorage.getItem('availability-draft:person:check-1')).toBe(
      '["morning"]',
    );
  });

  it('prunes missing and published Shifts before restoring, and Discard resets to server marks', async () => {
    localStorage.setItem(
      'availability-draft:person:check-1',
      JSON.stringify(['morning', 'evening', 'removed']),
    );
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        published: shift.shiftId === 'morning',
        available: shift.shiftId !== 'next-day',
      })),
    });
    renderPage();
    expect(
      await screen.findByText(m.availability_draft_restored()),
    ).toBeVisible();
    expect(
      JSON.parse(
        localStorage.getItem('availability-draft:person:check-1') ?? 'null',
      ),
    ).toEqual(['evening']);
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_draft_discard() }),
    );
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
    expect(
      screen.queryByText(m.availability_draft_restored()),
    ).not.toBeInTheDocument();
  });

  it('asks before router navigation or closing with unsent changes and releases both guards after Discard', async () => {
    localStorage.setItem('availability-draft:person:check-1', '["morning"]');
    const { router } = renderPage(vi.fn(), 'person', 'check-1', true);
    await screen.findByText(m.availability_draft_restored());
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    await stayOnLeave();
    expect(router.state.location.pathname).toBe('/availability/check-1');
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_draft_discard() }),
    );
    const discarded = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(discarded);
    expect(discarded.defaultPrevented).toBe(false);
    await act(() => router.navigate({ to: '/availability' }));
    expect(await screen.findByText('Away')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('leaves without sending from the leave dialog and keeps the draft on the device', async () => {
    const { router } = renderPage(vi.fn(), 'person', 'check-1', true);
    await userEvent.click(
      await screen.findByRole('switch', { name: /culto da manhã/i }),
    );
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    const dialog = await screen.findByRole('alertdialog', {
      name: m.availability_leave_title(),
    });
    expect(within(dialog).getByText(m.availability_leave_body())).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole('button', { name: m.availability_leave_exit() }),
    );
    expect(await screen.findByText('Away')).toBeVisible();
    expect(api.answerAvailabilityCheck).not.toHaveBeenCalled();
    expect(localStorage.getItem('availability-draft:person:check-1')).toBe(
      '["morning"]',
    );
  });

  it('sends the answer from the leave dialog', async () => {
    api.answerAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
    });
    const onAnswered = vi.fn();
    const { router } = renderPage(onAnswered, 'person', 'check-1', true);
    await userEvent.click(
      await screen.findByRole('switch', { name: /culto da manhã/i }),
    );
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    const dialog = await screen.findByRole('alertdialog', {
      name: m.availability_leave_title(),
    });
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    await waitFor(() => expect(onAnswered).toHaveBeenCalledOnce());
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['morning'],
      wholeDayDates: [],
    });
  });

  it('clears the draft before successful-answer navigation and releases the closing guard', async () => {
    api.answerAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
    });
    const onAnswered = vi.fn(async () => {
      expect(
        localStorage.getItem('availability-draft:person:check-1'),
      ).toBeNull();
      // The page keeps its submitting label until it has navigated away.
      expect(
        screen.getByRole('button', { name: m.availability_detail_pending() }),
      ).toBeDisabled();
      expect(
        screen.queryByText(m.availability_detail_confirmed()),
      ).not.toBeInTheDocument();
      const closing = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(closing);
      expect(closing.defaultPrevented).toBe(false);
      await router.navigate({ to: '/availability' });
    });
    const { router } = renderPage(onAnswered, 'person', 'check-1', true);
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await userEvent.click(toggles[0]);
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(await screen.findByText('Away')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('silently clears a restored entry whose marks all disappeared, were published or match the server', async () => {
    localStorage.setItem(
      'availability-draft:person:check-1',
      '["removed", "morning", "evening"]',
    );
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        published: shift.shiftId === 'morning',
        available: shift.shiftId !== 'evening',
      })),
    });
    renderPage();
    await screen.findByText('Kids · Outubro 2026');
    expect(
      screen.queryByText(m.availability_draft_restored()),
    ).not.toBeInTheDocument();
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
  });

  it('restores an empty draft when the unsent change removes a server mark', async () => {
    localStorage.setItem('availability-draft:person:check-1', '[]');
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    });
    renderPage();
    expect(
      await screen.findByText(m.availability_draft_restored()),
    ).toBeVisible();
    expect(
      screen.getAllByRole('switch', {
        name: /disponibilidade:/i,
      })[0],
    ).toBeChecked();
  });

  it('keeps a Past-Cycle server answer visible and ignores the stored draft', async () => {
    localStorage.setItem('availability-draft:person:check-1', '[]');
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      readOnly: true,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    });
    renderPage();
    const toggles = await screen.findAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).not.toBeChecked();
    expect(
      screen.queryByText(m.availability_draft_restored()),
    ).not.toBeInTheDocument();
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
  });

  it('drops refused published marks, refreshes detail and retries with the remaining draft', async () => {
    const response: AxiosResponse = {
      status: 409,
      statusText: 'Conflict',
      data: { error: 'SHIFT_PUBLISHED', shiftIds: ['morning'] },
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    api.answerAvailabilityCheck
      .mockRejectedValueOnce(
        new AxiosError('Published', undefined, undefined, undefined, response),
      )
      .mockResolvedValueOnce({ ...CHECK, state: 'confirmed' });
    api.getAvailabilityCheck.mockResolvedValueOnce(CHECK).mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        published: shift.shiftId === 'morning',
      })),
    });
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    await userEvent.click(screen.getByRole('switch', { name: /encontro/i }));
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_detail_published_retry(),
    );
    await waitFor(() =>
      expect(api.getAvailabilityCheck).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByText(m.availability_detail_locked_unassigned()),
    ).toBeVisible();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).not.toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    await waitFor(() =>
      expect(api.answerAvailabilityCheck).toHaveBeenLastCalledWith('check-1', {
        shiftIds: expect.arrayContaining(['evening', 'next-day']),
        wholeDayDates: ['2026-10-05'],
      }),
    );
    expect(api.answerAvailabilityCheck.mock.calls[1][1].shiftIds).toHaveLength(
      2,
    );
  });

  it('renders a Past-Cycle check with disabled switches, a read-only notice and no buttons', async () => {
    api.getAvailabilityCheck.mockResolvedValue({ ...CHECK, readOnly: true });
    renderPage();
    await screen.findByText('Kids · Outubro 2026');
    for (const toggle of screen.getAllByRole('switch'))
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(m.availability_detail_read_only())).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('switch', {
        name: /disponibilidade:/i,
      }),
    ).toHaveLength(3);
  });

  it('locks published rows while whole-day marking changes only unpublished Shifts', async () => {
    const late = {
      ...CHECK.shifts[1],
      shiftId: 'late',
      eventTitle: 'Culto tarde',
      startTime: '2026-10-05T01:30:00Z',
      endTime: '2026-10-05T02:30:00Z',
    };
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: [CHECK.shifts[0], CHECK.shifts[1], late, CHECK.shifts[2]].map(
        (shift) => ({
          ...shift,
          published: shift.shiftId === 'morning',
          assigned: shift.shiftId === 'morning',
          available: shift.shiftId !== 'morning',
        }),
      ),
    });
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      await screen.findByText(m.availability_detail_locked_assigned()),
    ).toBeVisible();
    const sunday = screen.getByRole('region', { name: SUNDAY });
    expect(
      within(sunday).getByRole('link', {
        name: m.availability_detail_published_link(),
      }),
    ).toHaveAttribute('href', '/my-schedule');
    // A mixed day counts only the Shifts still open to answer.
    expect(within(sunday).getByText('2 de 2 disponíveis')).toBeVisible();
    expect(
      screen.queryByRole('switch', { name: /culto da manhã/i }),
    ).not.toBeInTheDocument();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(
      screen.getByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    expect(toggles[0]).not.toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[2]).toBeChecked();
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['evening', 'late'],
      wholeDayDates: [],
    });
  });

  it('keeps confirmed edits as a draft after failure and retries an all-unavailable answer', async () => {
    const confirmed = {
      ...CHECK,
      state: 'confirmed',
      confirmedAt: '2026-10-01T12:00:00Z',
    };
    api.getAvailabilityCheck.mockResolvedValue(confirmed);
    api.answerAvailabilityCheck
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(confirmed);
    const onAnswered = vi.fn();
    renderPage(onAnswered);
    await userEvent.click(
      await screen.findByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    await userEvent.click(screen.getByRole('switch', { name: /encontro/i }));
    expect(screen.getByText(m.availability_detail_unsaved())).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_save_changes(),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_detail_send_error(),
    );
    const retry = screen.getByRole('button', {
      name: m.availability_detail_save_changes(),
    });
    expect(
      screen.getByText(
        m.availability_detail_confirmed_on({ date: '01/10/2026' }),
      ),
    ).toBeVisible();
    expect(screen.getByText(m.availability_detail_unsaved())).toBeVisible();
    expect(
      screen
        .getAllByRole('switch')
        .every((toggle) => toggle.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    expect(onAnswered).not.toHaveBeenCalled();
    await userEvent.click(retry);
    await waitFor(() => expect(onAnswered).toHaveBeenCalledOnce());
    expect(api.answerAvailabilityCheck).toHaveBeenLastCalledWith('check-1', {
      shiftIds: expect.arrayContaining(['morning', 'evening', 'next-day']),
      wholeDayDates: ['2026-10-04', '2026-10-05'],
    });
  });

  it('saves a confirmed check with live switches and preserves its confirmation display', async () => {
    const confirmed = {
      ...CHECK,
      state: 'confirmed',
      confirmedAt: '2026-10-01T12:00:00Z',
    };
    api.getAvailabilityCheck.mockResolvedValue(confirmed);
    api.answerAvailabilityCheck.mockResolvedValue(confirmed);
    renderPage();
    // Nothing to send yet: a calm done state instead of a save button.
    expect(await screen.findByText(m.availability_detail_done())).toBeVisible();
    // The answering rule stays in view for a returning volunteer.
    expect(screen.getByText(m.availability_detail_help_covers())).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: m.availability_detail_save_changes(),
      }),
    ).not.toBeInTheDocument();
    // One status line carries both the state and its date.
    expect(
      screen.queryByText(m.availability_detail_confirmed()),
    ).not.toBeInTheDocument();
    const confirmation = screen.getByText(
      m.availability_detail_confirmed_on({ date: '01/10/2026' }),
    );
    // An all-available answer has nothing for the shortcut to clear.
    expect(
      screen.queryByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('switch', {
        name: /disponibilidade:/i,
      })[0],
    );
    expect(
      screen.queryByText(m.availability_detail_done()),
    ).not.toBeInTheDocument();
    // While editing a saved answer, its discard is the only reset beside the save.
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_discard_changes(),
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_save_changes(),
      }),
    );
    await waitFor(() =>
      expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
        shiftIds: ['morning'],
        wholeDayDates: [],
      }),
    );
    expect(confirmation).toBeVisible();
  });

  it('confirms with zero marks once and prevents duplicate submissions while pending', async () => {
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    const confirm = await screen.findByRole('button', {
      name: m.availability_detail_confirm(),
    });
    await userEvent.dblClick(confirm);
    expect(api.answerAvailabilityCheck).toHaveBeenCalledTimes(1);
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: [],
      wholeDayDates: [],
    });
    expect(
      screen.getByRole('button', { name: m.availability_detail_pending() }),
    ).toBeDisabled();
    const toggle = screen.getAllByRole('switch')[0];
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('uses the singular Shift label and marks the Deadline overdue only after the Church day passes', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: [CHECK.shifts[1]],
    });
    setTestClock({ instant: parseInstant({ value: '2026-10-02T03:00:00Z' }) });
    renderPage();
    await userEvent.click(
      await screen.findByRole('switch', {
        name: /disponibilidade:/i,
      }),
    );
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    ).toBeEnabled();
    expect(screen.getByText(m.answers_overdue())).toBeVisible();
  });

  it('shows the not-serving gate without fetching a check', async () => {
    api.getCallerCapabilities.mockResolvedValue({
      churchId: 'church',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });
    renderPage();
    expect(await screen.findByText(m.shell_not_serving())).toBeVisible();
    expect(api.getAvailabilityCheck).not.toHaveBeenCalled();
  });

  it('shows indistinguishable not-found for another Volunteer and no loaded names', async () => {
    const response: AxiosResponse = {
      status: 404,
      statusText: 'Not Found',
      data: { error: 'NOT_FOUND' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    api.getAvailabilityCheck.mockRejectedValue(
      new AxiosError('Not Found', undefined, undefined, undefined, response),
    );
    renderPage();
    expect(await screen.findByText(m.error_not_found())).toBeVisible();
    expect(
      screen.getByRole('link', { name: m.availability_detail_back() }),
    ).toHaveAttribute('href', '/availability');
    expect(screen.queryByText('Kids · Outubro 2026')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a localized retry when loading the check fails', async () => {
    api.getAvailabilityCheck
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(CHECK);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_detail_load_error(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.schedules_retry() }),
    );
    expect(await screen.findByText('Kids · Outubro 2026')).toBeVisible();
  });

  it('keeps every mark after failure and retries through one atomic answer call', async () => {
    const onAnswered = vi.fn();
    api.answerAvailabilityCheck
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ ...CHECK, state: 'confirmed' });
    renderPage(onAnswered);
    const sunday = await screen.findByRole('region', {
      name: 'Domingo, 04/10/2026',
    });
    await userEvent.click(
      within(sunday).getByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_detail_send_error(),
    );
    const retry = screen.getByRole('button', {
      name: m.availability_detail_confirm(),
    });
    expect(
      within(sunday)
        .getAllByRole('switch')
        .every((toggle) => toggle.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    expect(onAnswered).not.toHaveBeenCalled();
    expect(api.answerAvailabilityCheck).toHaveBeenCalledTimes(1);
    expect(api.answerAvailabilityCheck).toHaveBeenLastCalledWith('check-1', {
      shiftIds: expect.arrayContaining(['morning', 'evening']),
      wholeDayDates: ['2026-10-04'],
    });
    await userEvent.click(retry);
    expect(api.answerAvailabilityCheck).toHaveBeenCalledTimes(2);
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('keeps the whole-day and individual switches consistent and states the live outcome', async () => {
    renderPage();
    const sunday = await screen.findByRole('region', {
      name: 'Domingo, 04/10/2026',
    });
    expect(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    ).toBeEnabled();
    const monday = screen.getByRole('region', { name: MONDAY });
    // A one-Shift day has no whole-day control; its switch does the job.
    expect(within(monday).queryByRole('button')).not.toBeInTheDocument();
    // Its switch is the whole answer, so the day heading repeats no count.
    expect(within(monday).queryByText(/de 1 disponív/)).not.toBeInTheDocument();
    const shifts = within(sunday).getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(
      within(sunday).getByRole('button', { name: allUnavailable(SUNDAY) }),
    );
    expect(shifts[0]).not.toBeChecked();
    expect(shifts[1]).not.toBeChecked();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(within(sunday).getByText('1 de 2 disponíveis')).toBeVisible();
    expect(
      within(sunday).getByRole('button', { name: allUnavailable(SUNDAY) }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(
      within(sunday).getByRole('button', { name: allAvailable(SUNDAY) }),
    ).toBeVisible();
    expect(
      screen.getByText(
        m.availability_detail_open_count({ unavailable: 2, total: 3 }),
      ),
    ).toBeVisible();
    await userEvent.click(
      within(sunday).getByRole('button', { name: allAvailable(SUNDAY) }),
    );
    expect(shifts[0]).toBeChecked();
    expect(shifts[1]).toBeChecked();
    expect(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    ).toBeEnabled();
  });

  it('opens a check directly and groups the backend-ordered Shifts by the Church CalendarDay', async () => {
    renderPage();
    const sunday = await screen.findByRole('region', {
      name: 'Domingo, 04/10/2026',
    });
    expect(within(sunday).getByText('Culto da manhã')).toBeVisible();
    expect(within(sunday).getByText('Culto à noite')).toBeVisible();
    expect(within(sunday).getByText('22:00 – 23:00')).toBeVisible();
    expect(within(sunday).getAllByRole('switch')).toHaveLength(2);
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByText('Bebês')).toBeVisible();
    expect(screen.getByText('01/10/2026')).toBeVisible();
    expect(screen.queryByText(m.answers_overdue())).not.toBeInTheDocument();
    expect(
      screen.getByText(m.availability_detail_due_today(), { exact: false }),
    ).toBeVisible();
    expect(
      screen.getByText(m.availability_detail_available_everywhere()),
    ).toBeVisible();
    expect(screen.getByText(m.availability_detail_help_covers())).toBeVisible();
    expect(api.getAvailabilityCheck).toHaveBeenCalledWith('check-1');
  });
});

describe('decision-first layout', () => {
  it('puts days left to answer first, folds fully published days with their outcome, and counts only open Shifts', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        published: shift.shiftId !== 'next-day',
      })),
    });
    renderPage();
    const monday = await screen.findByRole('region', { name: MONDAY });
    expect(
      screen
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label')),
    ).toEqual([MONDAY, SUNDAY]);
    const sunday = screen.getByRole('region', { name: SUNDAY });
    expect(sunday).not.toBeVisible();
    await userEvent.click(
      screen.getByText(m.availability_detail_published_days_one()),
    );
    // The day states the schedule outcome and points to it once.
    expect(
      within(sunday).getByText(m.availability_detail_published_day()),
    ).toBeVisible();
    expect(
      within(sunday).getAllByRole('link', {
        name: m.availability_detail_published_link(),
      }),
    ).toHaveLength(1);
    expect(
      within(sunday).getAllByText(m.availability_detail_locked_unassigned()),
    ).toHaveLength(2);
    expect(
      within(sunday).queryByText('2 de 2 disponíveis'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: m.availability_detail_back() }),
    ).toHaveAttribute('href', '/availability');
    await userEvent.click(within(monday).getByRole('switch'));
    // The one Shift's own state says it; no whole-day status on top.
    expect(
      within(monday).getByText(m.availability_detail_unavailable()),
    ).toBeVisible();
    expect(
      within(monday).queryByText(m.availability_detail_whole_day()),
    ).not.toBeInTheDocument();
    expect(within(monday).queryByText(/de 1 disponív/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_open_count_one({
          unavailable: 1,
          total: 1,
        }),
      }),
    ).toBeVisible();
  });

  it('only points to the schedule once every Shift is published', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({ ...shift, published: true })),
    });
    renderPage();
    await screen.findByText('Kids · Outubro 2026');
    expect(screen.getByText(m.availability_detail_help_locked())).toBeVisible();
    expect(
      screen.queryByText(m.availability_detail_help_covers()),
    ).not.toBeInTheDocument();
    // One status in the header, not a notice per day.
    expect(
      within(screen.getByTestId('availability-published-chip')).getByRole(
        'link',
        { name: m.availability_detail_published_link() },
      ),
    ).toHaveAttribute('href', '/my-schedule');
    expect(
      screen.getAllByRole('link', {
        name: m.availability_detail_published_link(),
      }),
    ).toHaveLength(1);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.availability_detail_confirm() }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.availability_detail_available_everywhere()),
    ).not.toBeInTheDocument();
  });

  it('undoes unsent changes on a confirmed answer back to the saved one', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
      confirmedAt: '2026-10-01T12:00:00Z',
    });
    renderPage();
    const morning = await screen.findByRole('switch', {
      name: /culto da manhã/i,
    });
    await userEvent.click(morning);
    expect(screen.getByText(m.availability_detail_unsaved())).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_discard_changes(),
      }),
    );
    expect(morning).toBeChecked();
    expect(screen.getByText(m.availability_detail_done())).toBeVisible();
    expect(api.answerAvailabilityCheck).not.toHaveBeenCalled();
  });
});

describe('everything-available shortcut', () => {
  it('appears once a Shift is marked, clears the marks without sending, and can be undone', async () => {
    const onAnswered = vi.fn();
    api.answerAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
    });
    renderPage(onAnswered);
    await screen.findByText('Kids · Outubro 2026');
    expect(
      screen.queryByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    ).not.toBeInTheDocument();
    const morning = screen.getByRole('switch', { name: /culto da manhã/i });
    await userEvent.click(morning);
    expect(
      screen.getByText(
        m.availability_detail_open_count({ unavailable: 1, total: 3 }),
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    );
    expect(api.answerAvailabilityCheck).not.toHaveBeenCalled();
    expect(morning).toBeChecked();
    expect(
      screen.getByText(m.availability_detail_available_everywhere()),
    ).toBeVisible();
    expect(
      screen.getByText(m.availability_detail_all_marked_available()),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_undo() }),
    );
    expect(morning).not.toBeChecked();
    expect(
      screen.getByText(
        m.availability_detail_open_count({ unavailable: 1, total: 3 }),
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: m.availability_detail_undo() }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: [],
      wholeDayDates: [],
    });
    await waitFor(() => expect(onAnswered).toHaveBeenCalledOnce());
  });

  it('stays hidden beside the done state; editing the saved answer offers its discard instead', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
      confirmedAt: '2026-10-01T12:00:00Z',
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        available: shift.shiftId !== 'morning',
      })),
    });
    renderPage();
    expect(await screen.findByText(m.availability_detail_done())).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /encontro/i }));
    expect(
      screen.queryByText(m.availability_detail_done()),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_discard_changes(),
      }),
    ).toBeVisible();
  });

  it('drops the undo offer once the volunteer edits again', async () => {
    renderPage();
    const morning = await screen.findByRole('switch', {
      name: /culto da manhã/i,
    });
    await userEvent.click(morning);
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_all(),
      }),
    );
    await userEvent.click(screen.getByRole('switch', { name: /encontro/i }));
    expect(
      screen.queryByRole('button', { name: m.availability_detail_undo() }),
    ).not.toBeInTheDocument();
    expect(morning).toBeChecked();
  });
});

describe('loading states', () => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    api.getAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage(undefined, undefined, undefined, undefined, new QueryClient());
    const region = await screen.findByRole('status', {
      name: m.availability_detail_loading(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the shown data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    api.getAvailabilityCheck.mockResolvedValue(CHECK);
    renderPage(undefined, undefined, undefined, undefined, queryClient);
    expect(await screen.findByText('Não confirmada')).toBeVisible();
    api.getAvailabilityCheck.mockClear();
    api.getAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.getAvailabilityCheck).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText('Não confirmada')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.availability_detail_loading() }),
    ).toBeNull();
  });
});
