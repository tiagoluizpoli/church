import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, setTestClock } from '@church/time';
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
    expect(await screen.findByText('Davi')).toBeVisible();
    expect(
      screen.getByText(m.answers_count({ confirmed: 2, asked: 4 })),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: m.answers_remind_cooldown({ time: '14:00' }),
      }),
    ).toBeDisabled();
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
        name: m.answers_remind_cooldown({ time: '14:00' }),
      }),
    ).toBeDisabled();
    expect(
      await screen.findByText(m.answers_count({ confirmed: 3, asked: 3 })),
    ).toBeVisible();
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
        name: m.answers_remind_cooldown({ time: '14:00' }),
      }),
    ).toBeDisabled();
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
    expect(screen.getByText('Caio')).toBeVisible();
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
      await screen.findByText(m.answers_count_one({ confirmed: 1, asked: 1 })),
    ).toBeVisible();
    expect(
      screen.getByText(
        m.answers_unavailable_count_one({ unavailable: 1, total: 1 }),
      ),
    ).toBeVisible();
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

  it('shows the read counts and the three groups in priority order with per-Volunteer Shift totals', async () => {
    overwriteGetLocale(() => locale);
    renderWithProviders(
      <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
    );
    expect(
      await screen.findByText(m.answers_count({ confirmed: 2, asked: 3 })),
    ).toBeVisible();
    const groups = screen.getAllByRole('list');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      m.answers_pending(),
      m.answers_available(),
      m.answers_unavailable(),
    ]);
    expect(within(groups[0]).getByText('Caio')).toBeVisible();
    expect(within(groups[1]).getByText('Bia')).toBeVisible();
    expect(within(groups[2]).getByText('Ana')).toBeVisible();
    expect(
      within(groups[2]).getByText(
        m.answers_unavailable_count({ unavailable: 2, total: 5 }),
      ),
    ).toBeVisible();
    expect(within(groups[0]).queryByText(/1.*4/)).not.toBeInTheDocument();
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
      name: m.answers_remind_cooldown({ time: '17:00' }),
    }),
  ).toBeDisabled();
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
  await screen.findByText(m.answers_count({ confirmed: 2, asked: 3 }));
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
  expect(
    await screen.findByText('10/01/2027', { selector: 'time' }),
  ).toBeVisible();
  await pickCalendarDate({
    user,
    trigger: screen.getByRole('button', { name: m.answers_deadline() }),
    date: '2027-01-12',
  });
  expect(
    await screen.findByText('12/01/2027', { selector: 'time' }),
  ).toBeVisible();
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
  expect(
    await screen.findByText(m.answers_no_deadline(), { selector: 'span' }),
  ).toBeVisible();
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

it('shows loading and failed reads distinctly from an empty Answers list and allows retry', async () => {
  api.getCycleAvailabilityStatus.mockReturnValue(new Promise(() => {}));
  const view = renderWithProviders(
    <AvailabilityStatusSection cycleId="cycle" ministryId="ministry" />,
  );
  expect(
    screen.getByRole('status', { name: m.answers_loading() }),
  ).toBeVisible();
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
    await screen.findByText(m.answers_count({ confirmed: 2, asked: 3 })),
  ).toBeVisible();
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
    screen.getByRole('button', { name: m.date_picker_clear() }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    m.answers_deadline_error(),
  );
  expect(screen.getByText('10/01/2027', { selector: 'time' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: m.answers_deadline() }),
  ).toBeEnabled();
});
