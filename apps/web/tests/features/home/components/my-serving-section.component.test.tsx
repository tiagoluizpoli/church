import { m } from '@church/i18n/messages';
import { parseInstant, setTestClock } from '@church/time';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import {
  HOME_USER_ID,
  renderHomePage,
} from '@/tests/features/home/components/render-home-page';
import {
  activeChurchApiMock,
  DEFAULT_CHURCH_ID,
} from '@/tests/setup/active-church';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';

const volunteerApi = vi.hoisted(() => ({
  listAvailabilityChecks: vi.fn(),
  getPublishedVolunteerSchedule: vi.fn(),
}));
vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
  volunteerApi,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    to,
    params = {},
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      className={className}
      href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '')}
    >
      {children}
    </a>
  ),
}));

const check = (
  id: string,
  state: 'pending' | 'confirmed',
  answerBy?: string,
) => ({
  id,
  cycleId: `cycle-${id}`,
  cycleName: `Cycle ${id}`,
  ministryId: 'kids',
  ministryName: `Ministry ${id}`,
  state,
  answerBy,
  totalShiftCount: 4,
  unavailableShiftCount: 0,
});

const assignment = (id: string, day: number, swapRequested = false) => ({
  assignmentId: id,
  eventId: 'e',
  eventTitle: 'Sunday',
  shiftId: `s-${id}`,
  startTime: `2026-10-${day}T13:30:00.000Z`,
  endTime: `2026-10-${day}T15:00:00.000Z`,
  ministryId: 'kids',
  ministryName: `Kids ${id}`,
  sectorName: 'Room',
  roleId: 'r',
  roleName: 'Teacher',
  status: 'confirmed' as const,
  swapRequested,
});

const SERVING = { hasVolunteerMembership: true };

function givenServing(
  input: Parameters<typeof callerCapabilitiesFixture>[0] = SERVING,
) {
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture(input),
  );
}

describe('MyServingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTestClock({
      instant: parseInstant({ value: '2026-10-10T12:00:00.000Z' }),
    });
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [{ churchId: DEFAULT_CHURCH_ID, name: 'St. Peter', areas: [] }],
    });
    volunteerApi.listAvailabilityChecks.mockResolvedValue({ checks: [] });
    volunteerApi.getPublishedVolunteerSchedule.mockResolvedValue({
      assignments: [],
      schedules: [],
    });
  });

  it('lists not-confirmed checks before the three earliest Assignments, with links and tags', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [
        check('done', 'confirmed'),
        check('open', 'pending', '2026-10-20'),
        check('late', 'pending', '2026-10-01'),
      ],
    });
    volunteerApi.getPublishedVolunteerSchedule.mockResolvedValue({
      assignments: [
        assignment('a-4', 25),
        assignment('a-2', 12, true),
        assignment('a-1', 11),
        assignment('a-3', 13),
      ],
      schedules: [],
    });
    renderHomePage();

    const section = (
      await screen.findByRole('heading', { name: m.home_section_serving() })
    ).closest('section') as HTMLElement;
    await within(section).findByText('Ministry open');
    const links = within(section).getAllByRole('link');
    expect(
      within(section).queryByText('Ministry done'),
    ).not.toBeInTheDocument();
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/availability/open',
      '/availability/late',
      '/my-schedule/a-1',
      '/my-schedule/a-2',
      '/my-schedule/a-3',
      '/my-schedule',
    ]);
    expect(within(section).queryByText(/Kids a-4/)).not.toBeInTheDocument();
    expect(
      within(section).getByText(m.my_schedule_swap_requested()),
    ).toBeVisible();
    const overdue = section.querySelector('time[datetime="2026-10-01"]');
    expect(overdue?.parentElement).toHaveClass('text-destructive');
    expect(
      section.querySelector('time[datetime="2026-10-20"]')?.parentElement,
    ).not.toHaveClass('text-destructive');
    expect(
      within(section).getByRole('link', { name: m.home_serving_see_all() }),
    ).toHaveAttribute('href', '/my-schedule');
  });

  it('keeps pending checks visible beside the empty schedule copy', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [check('open', 'pending')],
    });
    renderHomePage();

    expect(await screen.findByText('Ministry open')).toBeVisible();
    expect(await screen.findByText(m.my_schedule_empty())).toBeVisible();
  });

  it('fails each read independently and retries it without masquerading as empty', async () => {
    givenServing();
    volunteerApi.getPublishedVolunteerSchedule.mockRejectedValueOnce(
      new Error('down'),
    );
    volunteerApi.listAvailabilityChecks.mockResolvedValue({
      checks: [check('open', 'pending')],
    });
    renderHomePage();

    expect(await screen.findByText(m.my_schedule_load_error())).toBeVisible();
    expect(screen.getByText('Ministry open')).toBeVisible();
    expect(screen.queryByText(m.my_schedule_empty())).not.toBeInTheDocument();

    volunteerApi.getPublishedVolunteerSchedule.mockResolvedValue({
      assignments: [assignment('a-1', 11)],
      schedules: [],
    });
    await userEvent.click(screen.getByRole('button', { name: m.home_retry() }));
    expect(await screen.findByText(/Kids a-1/)).toBeVisible();
  });

  it('shows the checks error alone when only that read fails', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockRejectedValueOnce(
      new Error('down'),
    );
    renderHomePage();

    expect(await screen.findByText(m.availability_list_error())).toBeVisible();
    expect(await screen.findByText(m.my_schedule_empty())).toBeVisible();
  });

  it('shows loading states while the reads resolve', async () => {
    givenServing();
    volunteerApi.listAvailabilityChecks.mockReturnValue(new Promise(() => {}));
    volunteerApi.getPublishedVolunteerSchedule.mockReturnValue(
      new Promise(() => {}),
    );
    renderHomePage();

    expect(
      await screen.findByRole('status', {
        name: m.availability_list_loading(),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('status', { name: m.my_schedule_loading() }),
    ).toBeVisible();
  });

  it('serves a mixed persona and never reads for a non-serving caller', async () => {
    givenServing({ isChurchAdmin: true, hasVolunteerMembership: true });
    renderHomePage();
    await screen.findByText(m.my_schedule_empty());

    volunteerApi.listAvailabilityChecks.mockClear();
    volunteerApi.getPublishedVolunteerSchedule.mockClear();
    givenServing({ isChurchAdmin: true });
    renderHomePage({ queryClient: new QueryClient() });
    await screen.findByRole('heading', { name: m.home_section_church() });
    expect(volunteerApi.listAvailabilityChecks).not.toHaveBeenCalled();
    expect(volunteerApi.getPublishedVolunteerSchedule).not.toHaveBeenCalled();
  });

  it('scopes reads to Church and user under the Home serving key', async () => {
    givenServing();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderHomePage({ queryClient });
    await screen.findByText(m.my_schedule_empty());

    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          homeSectionQueryKey({
            section: 'serving',
            churchId: DEFAULT_CHURCH_ID,
            userId: HOME_USER_ID,
            parts: ['schedule'],
          }),
        ),
      ).toBeDefined(),
    );
  });
});
