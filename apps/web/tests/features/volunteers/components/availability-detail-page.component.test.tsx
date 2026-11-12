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
  shifts: [
    {
      shiftId: 'evening',
      eventId: 'event-1',
      eventTitle: 'Culto à noite',
      label: 'Recepção',
      startTime: '2026-10-05T01:00:00Z',
      endTime: '2026-10-05T02:00:00Z',
      available: true,
      published: false,
    },
    {
      shiftId: 'morning',
      eventId: 'event-2',
      eventTitle: 'Culto da manhã',
      label: 'Bebês',
      startTime: '2026-10-04T12:00:00Z',
      endTime: '2026-10-04T14:00:00Z',
      available: true,
      published: false,
    },
    {
      shiftId: 'next-day',
      eventId: 'event-3',
      eventTitle: 'Encontro',
      startTime: '2026-10-05T12:00:00Z',
      endTime: '2026-10-05T14:00:00Z',
      available: true,
      published: false,
    },
  ],
};

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
      screen.getByRole('button', { name: 'Confirmar disponibilidade' }),
    ).toBeEnabled();
    expect(api.answerAvailabilityCheck).not.toHaveBeenCalled();
  });

  it('reaches a named Shift switch and confirms using the keyboard', async () => {
    const user = userEvent.setup();
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    const shift = await screen.findByRole('switch', {
      name: /disponibilidade: culto da manhã.*04\/10\/2026.*bebês/i,
    });
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
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
    expect(confirm).toHaveBeenCalledWith(m.availability_draft_leave());
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
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
    expect(confirm).toHaveBeenCalledWith(m.availability_draft_leave());
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
      '["evening","morning","next-day"]',
    );
    expect(screen.getByText(m.availability_draft_restored())).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['evening', 'morning', 'next-day'],
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
    const day = (
      await screen.findAllByRole('button', {
        name: m.availability_detail_all_unavailable(),
      })
    )[0];
    expect(day).toBeDisabled();
    await act(async () =>
      resolveDetail({
        ...CHECK,
        shifts: [
          ...CHECK.shifts,
          {
            ...CHECK.shifts[1],
            shiftId: 'added',
            eventTitle: 'Added service',
          },
        ],
      }),
    );
    await screen.findByText('Added service');
    expect(day).toBeEnabled();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).not.toBeChecked();
    expect(toggles[1]).toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['evening', 'morning'],
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
    const days = await screen.findAllByRole('button', {
      name: m.availability_detail_all_unavailable(),
    });
    await userEvent.click(days[0]);
    await userEvent.click(days[1]);
    await act(async () =>
      resolveDetail({
        ...CHECK,
        shifts: [
          { ...CHECK.shifts[0], published: true },
          CHECK.shifts[2],
          { ...CHECK.shifts[1], shiftId: 'added', eventTitle: 'Added service' },
        ],
      }),
    );
    await screen.findByText('Added service');
    expect(screen.queryByText('Culto da manhã')).not.toBeInTheDocument();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).toBeChecked();
    expect(toggles[1]).toHaveAttribute('aria-disabled', 'true');
    expect(toggles[2]).not.toBeChecked();
    expect(
      screen.getAllByRole('button', {
        name: m.availability_detail_all_unavailable(),
      })[0],
    ).toBeEnabled();
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
    await screen.findByText('Kids');
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
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    expect(
      localStorage.getItem('availability-draft:person:check-1'),
    ).toBeNull();
    expect(
      screen.queryByText(m.availability_draft_restored()),
    ).not.toBeInTheDocument();
  });

  it('asks before router navigation or closing with unsent changes and releases both guards after Discard', async () => {
    localStorage.setItem('availability-draft:person:check-1', '["morning"]');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router } = renderPage(vi.fn(), 'person', 'check-1', true);
    await screen.findByText(m.availability_draft_restored());
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    await act(async () => {
      void router.navigate({ to: '/availability' });
    });
    expect(confirm).toHaveBeenCalledWith(m.availability_draft_leave());
    expect(router.state.location.pathname).toBe('/availability/check-1');
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_draft_discard() }),
    );
    const discarded = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(discarded);
    expect(discarded.defaultPrevented).toBe(false);
    await act(() => router.navigate({ to: '/availability' }));
    expect(await screen.findByText('Away')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('clears the draft before successful-answer navigation and releases the closing guard', async () => {
    api.answerAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      state: 'confirmed',
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onAnswered = vi.fn(async () => {
      expect(
        localStorage.getItem('availability-draft:person:check-1'),
      ).toBeNull();
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
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
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
    await screen.findByText('Kids');
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
    const days = await screen.findAllByRole('button', {
      name: m.availability_detail_all_unavailable(),
    });
    await userEvent.click(days[0]);
    await userEvent.click(days[1]);
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.availability_detail_published_retry(),
    );
    await waitFor(() =>
      expect(api.getAvailabilityCheck).toHaveBeenCalledTimes(2),
    );
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).toHaveAttribute('aria-disabled', 'true');
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[2]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_answer_error(),
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

  it('renders a Past-Cycle check with every control disabled and no answer button', async () => {
    api.getAvailabilityCheck.mockResolvedValue({ ...CHECK, readOnly: true });
    renderPage();
    await screen.findByText('Kids');
    for (const toggle of screen.getAllByRole('switch'))
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('button', { name: m.availability_detail_confirm() }),
    ).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button'))
      expect(button).toBeDisabled();
    expect(
      screen.getAllByRole('switch', {
        name: /disponibilidade:/i,
      }),
    ).toHaveLength(3);
  });

  it('locks published rows while whole-day marking changes only unpublished Shifts', async () => {
    api.getAvailabilityCheck.mockResolvedValue({
      ...CHECK,
      shifts: CHECK.shifts.map((shift) => ({
        ...shift,
        published: shift.shiftId === 'morning',
        available: shift.shiftId !== 'morning',
      })),
    });
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(
      await screen.findByText(m.availability_detail_published()),
    ).toBeVisible();
    const toggles = screen.getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    expect(toggles[0]).toHaveAttribute('aria-disabled', 'true');
    expect(toggles[0]).not.toBeChecked();
    const day = screen.getAllByRole('button', {
      name: m.availability_detail_all_unavailable(),
    })[0];
    await userEvent.click(day);
    expect(toggles[1]).not.toBeChecked();
    await userEvent.click(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    );
    expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
      shiftIds: ['evening'],
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
    const actions = await screen.findAllByRole('button', {
      name: m.availability_detail_all_unavailable(),
    });
    await userEvent.click(actions[0]);
    await userEvent.click(actions[1]);
    expect(screen.getByText(m.availability_detail_unsaved())).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_save_changes(),
      }),
    );
    const retry = await screen.findByRole('button', {
      name: m.availability_detail_save_error(),
    });
    expect(screen.getByText(m.availability_detail_confirmed())).toBeVisible();
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
    const save = await screen.findByRole('button', {
      name: m.availability_detail_save_changes(),
    });
    const badge = screen.getByText(m.availability_detail_confirmed());
    const confirmation = screen.getByText(
      m.availability_detail_confirmed_on({ date: '01/10/2026' }),
    );
    await userEvent.click(
      screen.getAllByRole('switch', {
        name: /disponibilidade:/i,
      })[0],
    );
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.answerAvailabilityCheck).toHaveBeenCalledWith('check-1', {
        shiftIds: ['morning'],
        wholeDayDates: [],
      }),
    );
    expect(badge).toBeVisible();
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
      shifts: [CHECK.shifts[0]],
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
    expect(screen.queryByText('Kids')).not.toBeInTheDocument();
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
    expect(await screen.findByText('Kids')).toBeVisible();
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
      within(sunday).getByRole('button', {
        name: m.availability_detail_all_unavailable(),
      }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    );
    const retry = await screen.findByRole('button', {
      name: m.availability_detail_answer_error(),
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
    const allDay = within(sunday).getByRole('button', {
      name: m.availability_detail_all_unavailable(),
    });
    const shifts = within(sunday).getAllByRole('switch', {
      name: /disponibilidade:/i,
    });
    await userEvent.click(allDay);
    expect(shifts[0]).not.toBeChecked();
    expect(shifts[1]).not.toBeChecked();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(within(sunday).getByText('1 de 2 disponíveis')).toBeVisible();
    expect(allDay).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm(),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(allDay).toBeDisabled();
    await userEvent.click(
      within(sunday).getByRole('button', {
        name: m.availability_detail_all_available(),
      }),
    );
    expect(shifts[0]).toBeChecked();
    expect(shifts[1]).toBeChecked();
    expect(
      screen.getByRole('button', { name: m.availability_detail_confirm() }),
    ).toBeEnabled();
  });

  it('opens a check directly and groups sorted Shifts by the Church CalendarDay', async () => {
    renderPage();
    const sunday = await screen.findByRole('region', {
      name: 'Domingo, 04/10/2026',
    });
    expect(within(sunday).getByText('Culto da manhã')).toBeVisible();
    expect(within(sunday).getByText('Culto à noite')).toBeVisible();
    expect(within(sunday).getByText('04/10/2026 22:00 – 23:00')).toBeVisible();
    expect(within(sunday).getAllByRole('switch')).toHaveLength(2);
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByText('Bebês')).toBeVisible();
    expect(screen.getByText('01/10/2026')).toBeVisible();
    expect(screen.queryByText(m.answers_overdue())).not.toBeInTheDocument();
    expect(api.getAvailabilityCheck).toHaveBeenCalledWith('check-1');
  });
});
