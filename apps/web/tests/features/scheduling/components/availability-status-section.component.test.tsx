import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityStatusSection } from '@/features/scheduling/components/availability-status-section';
import type { GetCycleAvailabilityStatus200 } from '@/infrastructure/api/churchAPI.schemas';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  getCycleAvailabilityStatus: vi.fn(),
  setAvailabilityDeadline: vi.fn(),
  remindSchedule: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({ adminApi: api }));

const ANSWERS: GetCycleAvailabilityStatus200 = {
  asked: 3,
  confirmed: 2,
  answerBy: null,
  remindAvailableAt: null,
  counts: { pending: 1, available: 1, unavailable: 1 },
  nextCursor: null,
  statuses: [
    {
      volunteerId: 'unavailable',
      volunteerName: 'Ana',
      state: 'confirmed',
      unavailableShiftCount: 2,
      shiftCount: 5,
    },
    {
      volunteerId: 'available',
      volunteerName: 'Bia',
      state: 'confirmed',
      unavailableShiftCount: 0,
      shiftCount: 3,
    },
    {
      volunteerId: 'pending',
      volunteerName: 'Caio',
      state: 'pending',
      unavailableShiftCount: 1,
      shiftCount: 4,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  api.getCycleAvailabilityStatus.mockResolvedValue(ANSWERS);
});
afterEach(() => {
  vi.useRealTimers();
  overwriteGetLocale(() => 'pt-BR');
});

describe.each(['pt-BR', 'en'] as const)('Answers in %s', (locale) => {
  it('reminds the not-confirmed count and refreshes newly eligible Volunteers', async () => {
    overwriteGetLocale(() => locale);
    api.remindSchedule.mockImplementation(async () => {
      api.getCycleAvailabilityStatus.mockResolvedValue({
        ...ANSWERS,
        asked: 4,
        remindAvailableAt: '2027-01-04T17:00:00Z',
        statuses: [
          ...ANSWERS.statuses,
          { ...ANSWERS.statuses[2], volunteerId: 'new', volunteerName: 'Davi' },
        ],
      });
      return {
        remindedCount: 1,
        newCheckCount: 1,
        remindAvailableAt: '2027-01-04T17:00:00Z',
      };
    });
    setTestClock({ instant: parseInstant({ value: '2027-01-03T17:00:00Z' }) });
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: m.answers_remind({ count: 1 }),
      }),
    );
    expect(api.remindSchedule).toHaveBeenCalledWith('cycle', {
      ministryId: 'ministry',
    });
    expect(screen.queryByText('Davi')).not.toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: m.answers_title() }),
    ).toHaveAttribute(
      'aria-valuetext',
      m.answers_count({ confirmed: 2, asked: 4 }),
    );
    const cooldown = screen.getByRole('button', {
      name: m.answers_remind_at({ time: '14:00' }),
    });
    expect(cooldown).toHaveAttribute('aria-disabled', 'true');
    // The short label keeps Lembrar's slot; the full sentence is its description.
    expect(cooldown).toHaveAccessibleDescription(
      m.answers_remind_cooldown({ time: '14:00' }),
    );
  });

  it('surfaces an early cooldown refusal time and refreshes the authoritative Answers', async () => {
    overwriteGetLocale(() => locale);
    setTestClock({ instant: parseInstant({ value: '2027-01-03T17:00:00Z' }) });
    api.remindSchedule.mockImplementation(async () => {
      api.getCycleAvailabilityStatus.mockResolvedValue({
        ...ANSWERS,
        confirmed: 3,
      });
      throw new AxiosError('refused', '409', undefined, undefined, {
        status: 409,
        data: {
          error: 'REMIND_ON_COOLDOWN',
          message: m.error_remind_on_cooldown(),
          remindAvailableAt: '2027-01-04T17:00:00Z',
        },
      } as AxiosResponse);
    });
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: m.answers_remind({ count: 1 }),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.answers_remind_cooldown({ time: '14:00' }),
    );
    expect(
      screen.getByRole('button', {
        name: m.answers_remind_at({ time: '14:00' }),
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      await screen.findByRole('progressbar', { name: m.answers_title() }),
    ).toHaveAttribute(
      'aria-valuetext',
      m.answers_count({ confirmed: 3, asked: 3 }),
    );
  });

  it('re-enables Remind when the Church-Timezone cooldown expires without navigation', async () => {
    overwriteGetLocale(() => locale);
    setTestClock({ instant: parseInstant({ value: '2027-01-04T16:59:59Z' }) });
    api.getCycleAvailabilityStatus.mockResolvedValue({
      ...ANSWERS,
      remindAvailableAt: '2027-01-04T17:00:00Z',
    });
    vi.useFakeTimers();
    await act(async () => {
      renderWithProviders(
        <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
        { churchTimezone: 'America/Sao_Paulo' },
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      screen.getByRole('button', {
        name: m.answers_remind_at({ time: '14:00' }),
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    setTestClock({ instant: parseInstant({ value: '2027-01-04T17:00:00Z' }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      screen.getByRole('button', { name: m.answers_remind({ count: 1 }) }),
    ).toBeEnabled();
  });

  it.each([
    0, 8,
  ])('shows %i not-confirmed Volunteers and permits a zero-recipient sweep', async (count) => {
    overwriteGetLocale(() => locale);
    api.getCycleAvailabilityStatus.mockResolvedValue({
      ...ANSWERS,
      asked: 2 + count,
    });
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    );
    expect(
      await screen.findByRole('button', { name: m.answers_remind({ count }) }),
    ).toBeEnabled();
  });

  it('prevents duplicate sends while pending and allows retry after a failed send', async () => {
    overwriteGetLocale(() => locale);
    let rejectSend: (error: Error) => void = () => {};
    api.remindSchedule.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSend = reject;
      }),
    );
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: m.answers_remind({ count: 1 }),
      }),
    );
    expect(
      screen.getByRole('button', { name: m.answers_remind_pending() }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: m.answers_remind_pending() }),
    );
    expect(api.remindSchedule).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectSend(new Error('offline'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.answers_remind_error(),
    );
    expect(
      screen.getByRole('progressbar', { name: m.answers_title() }),
    ).toHaveAttribute(
      'aria-valuetext',
      m.answers_count({ confirmed: 2, asked: 3 }),
    );
    expect(
      screen.getByRole('button', { name: m.answers_remind({ count: 1 }) }),
    ).toBeEnabled();
    api.remindSchedule.mockResolvedValue({
      remindedCount: 1,
      newCheckCount: 0,
      remindAvailableAt: '2027-01-04T17:00:00Z',
    });
    await user.click(
      screen.getByRole('button', { name: m.answers_remind({ count: 1 }) }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('uses singular counts for one confirmed Volunteer and one Shift', async () => {
    overwriteGetLocale(() => locale);
    api.getCycleAvailabilityStatus.mockResolvedValue({
      ...ANSWERS,
      asked: 1,
      confirmed: 1,
      statuses: [
        { ...ANSWERS.statuses[0], unavailableShiftCount: 1, shiftCount: 1 },
      ],
    });
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    );
    expect(
      await screen.findByRole('progressbar', { name: m.answers_title() }),
    ).toHaveAttribute(
      'aria-valuetext',
      m.answers_count_one({ confirmed: 1, asked: 1 }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.answers_view_roster(),
      }),
    );
    const details = m.answers_unavailable_count_one({
      unavailable: 1,
      total: 1,
    });
    await userEvent.click(
      await screen.findByRole('button', { name: `Ana: ${details}` }),
    );
    expect(await screen.findByText(details)).toBeVisible();
  });

  it('marks a deadline overdue only after the Church CalendarDay has passed', async () => {
    overwriteGetLocale(() => locale);
    setTestClock({ instant: parseInstant({ value: '2027-01-04T01:00:00Z' }) });
    api.getCycleAvailabilityStatus.mockResolvedValue({
      ...ANSWERS,
      answerBy: '2027-01-03',
    });
    const first = renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    expect(
      await screen.findByText('03/01/2027', { selector: 'time' }),
    ).toBeVisible();
    expect(screen.queryByText(m.answers_overdue())).not.toBeInTheDocument();
    first.unmount();
    setTestClock({ instant: parseInstant({ value: '2027-01-04T03:00:00Z' }) });
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    expect(await screen.findByText(m.answers_overdue())).toBeVisible();
  });

  it('summarizes groups in priority order and only requests names after disclosure', async () => {
    overwriteGetLocale(() => locale);
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    );
    expect(
      await screen.findByRole('progressbar', { name: m.answers_title() }),
    ).toHaveAttribute(
      'aria-valuetext',
      m.answers_count({ confirmed: 2, asked: 3 }),
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Caio')).not.toBeInTheDocument();
    expect(api.getCycleAvailabilityStatus).toHaveBeenCalledExactlyOnceWith(
      'cycle',
      { ministryId: 'ministry', limit: 1 },
    );
    const disclosures = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-controls'));
    expect(disclosures.map((button) => button.textContent)).toEqual([
      m.answers_view_roster(),
    ]);
    api.getCycleAvailabilityStatus.mockResolvedValue({
      ...ANSWERS,
      statuses: [ANSWERS.statuses[2]],
    });
    await userEvent.click(disclosures[0]);
    expect(
      await screen.findByRole('list', { name: m.answers_pending() }),
    ).toHaveTextContent('Caio');
    expect(api.getCycleAvailabilityStatus).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      status: undefined,
      q: undefined,
      cursor: undefined,
      limit: 200,
    });
    expect(
      screen.getByRole('radio', { name: `${m.answers_all()} · 3` }),
    ).toHaveAttribute('aria-checked', 'true');
    // Actionable groups lead: partial answers, available, then pending.
    expect(
      within(screen.getByRole('radiogroup', { name: m.answers_view_roster() }))
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual([
      `${m.answers_all()} · 3`,
      `${m.answers_unavailable()} · ${ANSWERS.counts.unavailable}`,
      `${m.answers_available()} · ${ANSWERS.counts.available}`,
      `${m.answers_pending()} · ${ANSWERS.counts.pending}`,
    ]);
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });
});

it('keeps a successful Remind cooldown scoped to its Schedule when navigating', async () => {
  setTestClock({ instant: parseInstant({ value: '2027-01-03T17:00:00Z' }) });
  api.remindSchedule.mockResolvedValue({
    remindedCount: 1,
    newCheckCount: 0,
    remindAvailableAt: '2027-01-04T17:00:00Z',
  });
  const view = renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: m.answers_remind({ count: 1 }) }),
  );
  expect(
    await screen.findByRole('button', {
      name: m.answers_remind_at({ time: '17:00' }),
    }),
  ).toHaveAttribute('aria-disabled', 'true');
  view.rerender(
    <AvailabilityStatusSection cycleId="other-cycle" ministryId="ministry" />,
  );
  expect(
    await screen.findByRole('button', { name: m.answers_remind({ count: 1 }) }),
  ).toBeEnabled();
});

it('sets, moves and clears the Deadline through the silent endpoint without any notification action', async () => {
  let answerBy: string | null = null;
  api.getCycleAvailabilityStatus.mockImplementation(async () => ({
    ...ANSWERS,
    answerBy,
  }));
  api.setAvailabilityDeadline.mockImplementation(async (_cycleId, body) => {
    answerBy = body.answerBy;
    return { answerBy };
  });
  const user = userEvent.setup();
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  await screen.findByRole('progressbar', { name: m.answers_title() });
  await user.click(
    screen.getByRole('button', { name: m.answers_edit_deadline() }),
  );
  expect(screen.getByText(m.answers_deadline_silent())).toBeVisible();
  await pickCalendarDate({
    user,
    trigger: screen.getByRole('button', { name: m.answers_deadline() }),
    date: '2027-01-10',
  });
  await waitFor(() =>
    expect(api.setAvailabilityDeadline).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      answerBy: '2027-01-10',
    }),
  );
  expect(await screen.findByText('10/01/2027')).toBeVisible();
  await pickCalendarDate({
    user,
    trigger: screen.getByRole('button', { name: m.answers_deadline() }),
    date: '2027-01-12',
  });
  expect(await screen.findByText('12/01/2027')).toBeVisible();
  expect(api.setAvailabilityDeadline).toHaveBeenLastCalledWith('cycle', {
    ministryId: 'ministry',
    answerBy: '2027-01-12',
  });
  await user.click(screen.getByRole('button', { name: m.date_picker_clear() }));
  await waitFor(() =>
    expect(api.setAvailabilityDeadline).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      answerBy: null,
    }),
  );
  expect(await screen.findByText(m.answers_no_deadline())).toBeVisible();
  expect(screen.queryByText(m.answers_overdue())).not.toBeInTheDocument();
});

it('keeps Answers visible but removes Deadline editing when read-only', async () => {
  api.getCycleAvailabilityStatus.mockResolvedValue({
    ...ANSWERS,
    answerBy: '2027-01-10',
  });
  renderWithProviders(
    <AvailabilityStatusSection
      cycleId="cycle"
      ministryId="ministry"
      readOnly
    />,
  );
  expect(await screen.findByText('10/01/2027')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: m.answers_deadline() }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: m.date_picker_clear() }),
  ).not.toBeInTheDocument();
  expect(api.setAvailabilityDeadline).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: m.answers_remind({ count: 1 }) }),
  ).not.toBeInTheDocument();
  expect(api.remindSchedule).not.toHaveBeenCalled();
});

it('keeps the Answers on screen while a refetch is in flight', async () => {
  const queryClient = new QueryClient();
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    { queryClient },
  );
  expect(
    await screen.findByRole('progressbar', { name: m.answers_title() }),
  ).toHaveAttribute(
    'aria-valuetext',
    m.answers_count({ confirmed: 2, asked: 3 }),
  );
  api.getCycleAvailabilityStatus.mockReturnValue(new Promise(() => {}));
  act(() => {
    void queryClient.invalidateQueries();
  });
  await waitFor(() =>
    expect(api.getCycleAvailabilityStatus).toHaveBeenCalledTimes(2),
  );
  expect(
    screen.getByRole('progressbar', { name: m.answers_title() }),
  ).toHaveAttribute(
    'aria-valuetext',
    m.answers_count({ confirmed: 2, asked: 3 }),
  );
  expect(
    screen.queryByRole('status', { name: m.answers_loading() }),
  ).toBeNull();
});

it('shows loading and failed reads distinctly from an empty Answers list and allows retry', async () => {
  api.getCycleAvailabilityStatus.mockReturnValue(new Promise(() => {}));
  const view = renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  const loading = screen.getByRole('status', { name: m.answers_loading() });
  expect(loading).toHaveAttribute('aria-busy', 'true');
  expect(loading.querySelector('[data-slot="skeleton"]')).toBeNull();
  await waitFor(() =>
    expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
  );
  expect(screen.queryByText(m.answers_empty())).not.toBeInTheDocument();
  expect(
    screen.queryByText(m.answers_count({ confirmed: 0, asked: 0 })),
  ).not.toBeInTheDocument();
  view.unmount();
  api.getCycleAvailabilityStatus
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(ANSWERS);
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(m.answers_error());
  expect(screen.queryByText(m.answers_empty())).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: m.schedules_retry() }),
  );
  expect(
    await screen.findByRole('progressbar', { name: m.answers_title() }),
  ).toHaveAttribute(
    'aria-valuetext',
    m.answers_count({ confirmed: 2, asked: 3 }),
  );
});

it('preserves the saved Deadline and surfaces a refusal when an edit fails', async () => {
  api.getCycleAvailabilityStatus.mockResolvedValue({
    ...ANSWERS,
    answerBy: '2027-01-10',
  });
  api.setAvailabilityDeadline.mockRejectedValue(
    new Error('published in another tab'),
  );
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  await screen.findByText('10/01/2027', { selector: 'time' });
  await userEvent.click(
    screen.getByRole('button', { name: m.answers_edit_deadline() }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: m.date_picker_clear() }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    m.answers_deadline_error(),
  );
  expect(screen.getByText('10/01/2027')).toBeVisible();
  expect(
    screen.getByRole('button', { name: m.answers_deadline() }),
  ).toBeEnabled();
});

it('uses server status, search and cursors, keeps names collapsed and hides empty groups', async () => {
  const first = {
    ...ANSWERS,
    counts: { pending: 2, available: 1, unavailable: 0 },
    statuses: [ANSWERS.statuses[2]],
    nextCursor: 'next-page',
  };
  api.getCycleAvailabilityStatus.mockImplementation(async (_cycle, params) => {
    if (params.limit === 1) return first;
    if (params.q) return { ...first, statuses: [], nextCursor: null };
    if (params.cursor)
      return {
        ...first,
        statuses: [
          {
            ...ANSWERS.statuses[2],
            volunteerId: 'davi',
            volunteerName: 'Davi',
          },
        ],
        nextCursor: null,
      };
    if (params.status === 'available')
      return { ...first, statuses: [ANSWERS.statuses[1]], nextCursor: null };
    return first;
  });
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  const pending = await screen.findByRole('button', {
    name: m.answers_view_roster(),
  });
  expect(screen.queryByText('Caio')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: m.answers_view_group({ count: 0, group: m.answers_unavailable() }),
    }),
  ).not.toBeInTheDocument();
  await userEvent.click(pending);
  expect(
    within(
      await screen.findByRole('list', { name: m.answers_pending() }),
    ).getByText('Caio'),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: m.answers_load_more() }),
  );
  await waitFor(() =>
    expect(api.getCycleAvailabilityStatus).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      status: undefined,
      q: undefined,
      cursor: 'next-page',
      limit: 200,
    }),
  );
  const list = screen.getByTestId('availability-status-list');
  expect(await within(list).findByText('Davi')).toBeVisible();
  expect(within(list).getByText('Caio')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: m.answers_load_more() }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('radio', { name: `${m.answers_available()} · 1` }),
  );
  expect(await within(list).findByText('Bia')).toBeVisible();
  expect(within(list).queryByText('Caio')).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole('textbox', { name: m.answers_search() }),
    'x',
  );
  await waitFor(() =>
    expect(api.getCycleAvailabilityStatus).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      status: 'available',
      q: 'x',
      cursor: undefined,
      limit: 200,
    }),
  );
  expect(await screen.findByText(m.shell_search_no_results())).toBeVisible();
});

it('reads the roster once per typing pause, not once per keystroke', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  await user.click(
    await screen.findByRole('button', { name: m.answers_view_roster() }),
  );
  const search = await screen.findByRole('textbox', {
    name: m.answers_search(),
  });
  await user.type(search, 'ana');
  await waitFor(() =>
    expect(api.getCycleAvailabilityStatus).toHaveBeenLastCalledWith('cycle', {
      ministryId: 'ministry',
      status: undefined,
      q: 'ana',
      cursor: undefined,
      limit: 200,
    }),
  );
  const queries = api.getCycleAvailabilityStatus.mock.calls
    .map(([, params]) => params.q)
    .filter(Boolean);
  expect(queries).toEqual(['ana']);
});

it('reveals partial-answer details when keyboard focus reaches a compact chip', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  await user.click(
    await screen.findByRole('button', { name: m.answers_view_roster() }),
  );
  const search = await screen.findByRole('textbox', {
    name: m.answers_search(),
  });
  search.focus();
  await user.tab();
  const details = m.answers_unavailable_count({ unavailable: 2, total: 5 });
  expect(screen.getByRole('button', { name: `Ana: ${details}` })).toHaveFocus();
  expect(await screen.findByText(details)).toBeVisible();
});

describe('Respostas bar trailing actions', () => {
  it('ends the bar row with the page actions, right of the progress on wide containers', async () => {
    renderWithProviders(
      <AvailabilityStatusSection
        cycleId="cycle"
        ministryId="ministry"
        headerSummary
        trailing={<a href="/assign">Open</a>}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    const progress = await screen.findByRole('progressbar', {
      name: m.answers_title(),
    });
    const actions = screen.getByTestId('availability-status-actions');
    const bar = actions.parentElement as HTMLElement;
    expect(bar).toContainElement(progress);
    expect(bar).toHaveClass('flex', 'flex-wrap', 'items-center');
    expect(actions).toHaveClass(
      'flex',
      'flex-wrap',
      'items-center',
      'justify-end',
    );
    expect(bar.lastElementChild).toBe(actions);
    // One group: the bar's own actions, then the page's, wrapping together.
    expect([...actions.children].map((child) => child.textContent)).toEqual([
      m.answers_view_roster(),
      m.answers_edit_deadline(),
      m.answers_remind({ count: 1 }),
      'Open',
    ]);
  });

  it('keeps a cooling-down Lembrar in the same group, size and slot as before', async () => {
    api.remindSchedule.mockResolvedValue({
      remindedCount: 1,
      newCheckCount: 0,
      remindAvailableAt: '2027-01-04T17:00:00Z',
    });
    setTestClock({ instant: parseInstant({ value: '2027-01-03T17:00:00Z' }) });
    renderWithProviders(
      <AvailabilityStatusSection
        cycleId="cycle"
        ministryId="ministry"
        headerSummary
        trailing={<a href="/assign">Open</a>}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    const remind = await screen.findByRole('button', {
      name: m.answers_remind({ count: 1 }),
    });
    const before = remind.className;
    await userEvent.click(remind);
    const cooldown = await screen.findByRole('button', {
      name: m.answers_remind_at({ time: '14:00' }),
    });
    const actions = screen.getByTestId('availability-status-actions');
    expect(cooldown.parentElement).toBe(actions);
    expect(cooldown.className).toBe(before);
    expect(
      [...actions.children]
        .filter((child) => !child.classList.contains('sr-only'))
        .map((child) => child.textContent),
    ).toEqual([
      m.answers_view_roster(),
      m.answers_edit_deadline(),
      m.answers_remind_at({ time: '14:00' }),
      'Open',
    ]);
  });

  it('keeps the page actions while the answers read has failed', async () => {
    api.getCycleAvailabilityStatus.mockRejectedValue(new Error('down'));
    renderWithProviders(
      <AvailabilityStatusSection
        cycleId="cycle"
        ministryId="ministry"
        trailing={<a href="/assign">Open</a>}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );
    expect(await screen.findByText(m.answers_error())).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open' })).toBeVisible();
  });
});
