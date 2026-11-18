import { m } from '@church/i18n/messages';
import { setLocale } from '@church/i18n/runtime';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyMinistrySchedulePage } from '@/features/volunteers/components/my-ministry-schedule-page';
import type { GetMinistrySchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({ getMinistrySchedule: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ volunteerApi: api }));

const SCHEDULE: GetMinistrySchedule200 = {
  ministryId: 'kids',
  ministryName: 'Kids',
  cycleId: 'october',
  cycleName: 'Outubro 2026',
  published: true,
  events: [
    {
      eventId: 'sunday',
      title: 'Sunday Service',
      start: '2026-10-11T12:00:00.000Z',
      end: '2026-10-11T14:00:00.000Z',
      assignmentCount: 1,
      rows: [
        {
          shiftId: 'shift-1',
          shiftStart: '2026-10-11T12:00:00.000Z',
          shiftEnd: '2026-10-11T13:00:00.000Z',
          shiftLabel: 'Morning',
          sectorName: 'Babies Room',
          roleName: 'Teacher',
          volunteerDisplayName: 'Alice T.',
        },
        {
          shiftId: 'shift-1',
          shiftStart: '2026-10-11T12:00:00.000Z',
          shiftEnd: '2026-10-11T13:00:00.000Z',
          shiftLabel: 'Morning',
          sectorName: 'Kids Room',
          roleName: 'Teacher',
        },
      ],
    },
  ],
};

function renderPage() {
  return renderWithProviders(
    <MyMinistrySchedulePage ministryId="kids" cycleId="october" />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => setLocale('en'));

describe.each([
  'en',
  'pt-BR',
] as const)('MyMinistrySchedulePage (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it('renders Events, Shifts, names and Open places without confirmation state', async () => {
    api.getMinistrySchedule.mockResolvedValue(SCHEDULE);
    renderPage();

    expect(await screen.findByText('Sunday Service')).toBeTruthy();
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(
      screen.getByText(
        m.my_schedule_ministry_sector_role({
          sector: 'Babies Room',
          role: 'Teacher',
        }),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Alice T.')).toBeTruthy();
    expect(screen.getByText(m.my_schedule_ministry_open_place())).toBeTruthy();
    expect(screen.queryByText(/confirmed|pending|declined/i)).toBeNull();
    expect(api.getMinistrySchedule).toHaveBeenCalledWith('kids', {
      cycleId: 'october',
    });
  });

  it('groups rows per Shift, not per Event time block', async () => {
    const [first] = SCHEDULE.events;
    const [row] = first?.rows ?? [];
    if (!first || !row) throw new Error('fixture');
    api.getMinistrySchedule.mockResolvedValue({
      ...SCHEDULE,
      events: [
        {
          ...first,
          rows: [row, { ...row, shiftId: 'shift-2', shiftLabel: 'Late' }],
        },
      ],
    });
    renderPage();
    expect(await screen.findByText('Morning')).toBeTruthy();
    expect(screen.getByText('Late')).toBeTruthy();
  });

  it('says the schedule is not published yet', async () => {
    api.getMinistrySchedule.mockResolvedValue({
      ...SCHEDULE,
      published: false,
      events: [],
    });
    renderPage();
    expect(
      await screen.findByText(m.my_schedule_ministry_unpublished()),
    ).toBeTruthy();
  });

  it('shows the neutral message on the concealed-scope 404', async () => {
    api.getMinistrySchedule.mockRejectedValue(
      new AxiosError('nope', '404', undefined, undefined, {
        status: 404,
      } as never),
    );
    renderPage();
    expect(
      await screen.findByText(m.my_schedule_ministry_unavailable()),
    ).toBeTruthy();
  });
});

describe('loading states', () => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    api.getMinistrySchedule.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <MyMinistrySchedulePage ministryId="kids" cycleId="october" />,
      { queryClient: new QueryClient() },
    );
    const region = screen.getByRole('status', {
      name: m.my_schedule_ministry_loading(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the shown data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    api.getMinistrySchedule.mockResolvedValue(SCHEDULE);
    renderWithProviders(
      <MyMinistrySchedulePage ministryId="kids" cycleId="october" />,
      { queryClient: queryClient },
    );
    expect(await screen.findByText('Sunday Service')).toBeVisible();
    api.getMinistrySchedule.mockClear();
    api.getMinistrySchedule.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.getMinistrySchedule).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText('Sunday Service')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.my_schedule_ministry_loading() }),
    ).toBeNull();
  });
});
