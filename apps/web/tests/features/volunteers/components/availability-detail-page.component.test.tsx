import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityDetailPage } from '@/features/volunteers/components/availability-detail-page';
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

function renderPage(onAnswered = vi.fn()) {
  return renderWithProviders(
    <CallerCapabilitiesScopeProvider churchId="church" userId="person">
      <AvailabilityDetailPage checkId="check-1" onAnswered={onAnswered} />
    </CallerCapabilitiesScopeProvider>,
    { churchTimezone: 'America/Sao_Paulo' },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
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
  it('confirms with zero marks once and prevents duplicate submissions while pending', async () => {
    api.answerAvailabilityCheck.mockReturnValue(new Promise(() => {}));
    renderPage();
    const confirm = await screen.findByRole('button', {
      name: m.availability_detail_confirm_all(),
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
    expect(toggle).not.toBeChecked();
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
        name: m.availability_detail_unavailable(),
      }),
    );
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_count_one({
          unavailable: 1,
          total: 1,
        }),
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
      within(sunday).getByRole('switch', {
        name: m.availability_detail_whole_day(),
      }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_count({ unavailable: 2, total: 3 }),
      }),
    );
    const retry = await screen.findByRole('button', {
      name: m.availability_detail_answer_error(),
    });
    expect(
      within(sunday)
        .getAllByRole('switch')
        .every((toggle) => toggle.getAttribute('aria-checked') === 'true'),
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
      screen.getByRole('button', { name: m.availability_detail_confirm_all() }),
    ).toBeEnabled();
    const allDay = within(sunday).getByRole('switch', {
      name: m.availability_detail_whole_day(),
    });
    const shifts = within(sunday).getAllByRole('switch', {
      name: m.availability_detail_unavailable(),
    });
    await userEvent.click(allDay);
    expect(shifts[0]).toBeChecked();
    expect(shifts[1]).toBeChecked();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_count({ unavailable: 2, total: 3 }),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(allDay).not.toBeChecked();
    expect(
      screen.getByRole('button', {
        name: m.availability_detail_confirm_count({ unavailable: 1, total: 3 }),
      }),
    ).toBeEnabled();
    await userEvent.click(shifts[0]);
    expect(allDay).toBeChecked();
    await userEvent.click(allDay);
    expect(shifts[0]).not.toBeChecked();
    expect(shifts[1]).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: m.availability_detail_confirm_all() }),
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
    expect(within(sunday).getAllByRole('switch')).toHaveLength(3);
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByText('Bebês')).toBeVisible();
    expect(screen.getByText('01/10/2026')).toBeVisible();
    expect(screen.queryByText(m.answers_overdue())).not.toBeInTheDocument();
    expect(api.getAvailabilityCheck).toHaveBeenCalledWith('check-1');
  });
});
