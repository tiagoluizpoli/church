import { m } from '@church/i18n/messages';
import { getLocale, overwriteGetLocale } from '@church/i18n/runtime';
import { formatWeekdayShort, parseCalendarDay } from '@church/time';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BLOCK,
  CYCLE_ID,
  EVENT,
  MINISTRY_ID,
  ROLES,
  SCHEDULE,
  SECTORS,
} from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { activeChurchApiMock } from '@/tests/setup/active-church';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { startHangingRefetch } from '@/tests/setup/refetch';
import { renderRoute } from '@/tests/setup/render-route';

const api = vi.hoisted(() => ({
  getAskPreview: vi.fn(),
  getCycleAvailabilityStatus: vi.fn(),
  askScheduleAvailability: vi.fn(),
  listMinistries: vi.fn(),
  listScheduleSummaries: vi.fn(),
  getCycleParticipation: vi.fn(),
  getSchedule: vi.fn(),
  listSectors: vi.fn(),
  listMinistryRoles: vi.fn(),
}));
vi.mock('@/utils/api-instances', async () => ({
  adminApi: api,
  notificationsApi: {
    getNotifications: async () => ({ items: [], unreadCount: 0 }),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: async () =>
      callerCapabilitiesFixture({ ledMinistries: 1 }),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
    useSession: () => ({ data: null, isPending: false }),
  },
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

beforeEach(() => {
  vi.clearAllMocks();
  api.getCycleAvailabilityStatus.mockResolvedValue({
    asked: 151,
    confirmed: 1,
    counts: { pending: 150, available: 1, unavailable: 0 },
    answerBy: null,
    remindAvailableAt: null,
    statuses: [],
    nextCursor: null,
  });
  api.askScheduleAvailability.mockReset();
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 34,
    shiftCount: 12,
    eventCount: 9,
    flaggedBlocks: [],
    rolesWithoutHolders: [],
  });
  api.listMinistries.mockRejectedValue(new Error('admin-only read'));
  api.listScheduleSummaries.mockResolvedValue({ cycles: [] });
  api.getCycleParticipation.mockResolvedValue({
    events: [EVENT],
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 0 },
  });
  api.getSchedule.mockResolvedValue(SCHEDULE);
  api.listSectors.mockResolvedValue({ sectors: SECTORS });
  api.listMinistryRoles.mockResolvedValue({ roles: ROLES });
  activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
    churches: [],
  });
});

it('puts the Schedule actions at the end of the Respostas row with 44px touch targets on phones and desktop density elsewhere', async () => {
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const builder = await screen.findByRole('link', {
    name: m.prepare_open_builder(),
  });
  const actions = builder.parentElement as HTMLElement;
  // No box of its own: the actions join the row they sit in, flush right, wrapping as one group.
  expect(actions).toHaveClass('contents');
  expect(actions.parentElement).toHaveClass(
    'flex',
    'flex-wrap',
    'items-center',
    'justify-end',
  );
  expect(actions).toHaveClass(
    'max-md:[&_a]:min-h-11',
    'max-md:[&_button]:min-h-11',
  );
  expect(actions).toHaveClass(
    'max-md:[&_a]:text-sm',
    'max-md:[&_button]:text-sm',
  );
  expect(actions).not.toHaveClass('[&_a]:min-h-11', '[&_button]:min-h-11');
});

it('shows a leader-callable Schedule with a link to edit one Time block and no inline or batched controls', async () => {
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const row = await screen.findByTestId(
    'prepare-event-time-block-row-33333333-3333-4333-8333-333333333333',
  );
  expect(row).toHaveAttribute(
    'href',
    `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/33333333-3333-4333-8333-333333333333`,
  );
  expect(
    screen.getByRole('button', {
      name: m.prepare_filters_toggle_none(),
    }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(within(row).queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('save-and-ask-availability-button'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: m.prepare_open_builder() }),
  ).toHaveAttribute('href', `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/assign`);
  expect(api.listMinistries).not.toHaveBeenCalled();
  expect(api.listScheduleSummaries).not.toHaveBeenCalled();
});

it('shows a read-only Schedule for a past Cycle with navigation to view the block', async () => {
  api.getSchedule.mockResolvedValue({
    ...SCHEDULE,
    cycle: { ...SCHEDULE.cycle, state: 'past' },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_block_read_only())).toBeVisible();
  expect(
    screen.queryByRole('button', { name: m.prepare_ask() }),
  ).not.toBeInTheDocument();
  expect(api.getAskPreview).not.toHaveBeenCalled();
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toHaveAttribute('href');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('keeps a published Schedule preparable without asking again, so an added Event can be staffed', async () => {
  api.getSchedule.mockResolvedValue({ ...SCHEDULE, stage: 'published' });
  api.getCycleParticipation.mockResolvedValue({
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 0 },
    events: [
      {
        ...EVENT,
        participation: { ...EVENT.participation, state: 'published' },
      },
    ],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toHaveAttribute('href');
  expect(screen.queryByText(m.prepare_block_read_only())).toBeNull();
  expect(
    screen.queryByRole('button', { name: m.prepare_ask() }),
  ).not.toBeInTheDocument();
});

it('shows the swap request count on the badge and links to the Assign board', async () => {
  api.getSchedule.mockResolvedValue({
    ...SCHEDULE,
    stage: 'published',
    openSwapRequestCount: 2,
  });
  api.getCycleParticipation.mockResolvedValue({
    events: [],
    dayMarkers: [],
    totals: { blocks: 0, needsAttention: 0 },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.schedules_published())).toBeVisible();
  expect(
    screen.getByRole('link', {
      name: m.schedules_swap_requests_link({ count: 2 }),
    }),
  ).toHaveAttribute('href', `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/assign`);
});

it('distinguishes an empty Schedule from filters with no matches', async () => {
  api.getCycleParticipation.mockResolvedValue({
    events: [],
    dayMarkers: [],
    totals: { blocks: 0, needsAttention: 0 },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_empty())).toBeVisible();
  expect(screen.queryByText(m.prepare_filter_empty())).not.toBeInTheDocument();
});

it('opens the nested block page with no page-level leave confirmation', async () => {
  const user = userEvent.setup();
  const { router } = renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await user.click(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  );
  expect(
    await screen.findByRole('checkbox', { name: m.usual_setup_serves_label() }),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe(
    `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/${BLOCK.eventTimeBlock.id}`,
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('queries name and day filters on the server and retains unfiltered day markers and totals', async () => {
  const user = userEvent.setup();
  api.getCycleParticipation.mockImplementation(async (_cycleId, params) => ({
    events: params.q || params.day === '2027-01-04' ? [] : [EVENT],
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 1 },
  }));
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  await user.click(
    screen.getByRole('button', {
      name: m.prepare_filters_toggle_none(),
    }),
  );
  const filter = screen.getByRole('textbox', { name: m.prepare_filter_name() });
  await user.type(filter, 'missing');
  expect(
    await screen.findByText(
      m.prepare_filtered_description({ filters: 'missing' }),
    ),
  ).toBeVisible();
  expect(api.getCycleParticipation).toHaveBeenLastCalledWith(CYCLE_ID, {
    ministryId: MINISTRY_ID,
    day: undefined,
    q: 'missing',
    timeMode: 'starts',
    timeFrom: undefined,
    timeTo: undefined,
    needsAttention: undefined,
  });
  expect(screen.getByTestId('prepare-stat-attention')).toHaveTextContent('1');
  await user.clear(filter);
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
  await user.click(screen.getByTestId('prepare-calendar-day-2027-01-04'));
  const dayFilter = m.prepare_filter_day_selected({
    day: `${formatWeekdayShort({ day: parseCalendarDay({ value: '2027-01-04' }), locale: getLocale() })} 04/01`,
  });
  expect(
    await screen.findByText(
      m.prepare_filtered_description({ filters: dayFilter }),
    ),
  ).toBeVisible();
  expect(screen.getByTestId('prepare-filter-summary')).toHaveTextContent(
    `${m.prepare_filtered_count_other({ count: 0 })}${dayFilter}`,
  );
  await user.click(screen.getByTestId('prepare-calendar-day-2027-01-03'));
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});

it('keeps previous rows mounted during a filter request', async () => {
  const user = userEvent.setup();
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  api.getCycleParticipation.mockReturnValue(new Promise(() => {}));
  await user.click(
    screen.getByRole('button', {
      name: m.prepare_filters_toggle_none(),
    }),
  );
  await user.type(
    screen.getByRole('textbox', { name: m.prepare_filter_name() }),
    'a',
  );
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('status', { name: m.schedules_loading() }),
  ).not.toBeInTheDocument();
});

it.each([
  'schedules',
  'participation',
] as const)('shows no-access for a forbidden %s read', async (read) => {
  const query =
    read === 'schedules' ? api.getSchedule : api.getCycleParticipation;
  query.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.shell_no_access())).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  expect(screen.queryByText(m.error_not_found())).not.toBeInTheDocument();
});

it.each([
  'scoped-list',
  'participation',
] as const)('shows not-found when the Schedule is absent from %s', async (read) => {
  if (read === 'scoped-list')
    api.getSchedule.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
  else
    api.getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.error_not_found())).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('prepare-retryable-error-state'),
  ).not.toBeInTheDocument();
});

it.each([
  'schedules',
  'participation',
] as const)('shows a retryable %s error and recovers to the Schedule', async (read) => {
  const user = userEvent.setup();
  const query =
    read === 'schedules' ? api.getSchedule : api.getCycleParticipation;
  query.mockRejectedValue(new Error('Network unavailable'));
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_schedule_error())).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  api.getSchedule.mockResolvedValue(SCHEDULE);
  api.getCycleParticipation.mockResolvedValue({
    events: [EVENT],
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 0 },
  });
  await user.click(screen.getByRole('button', { name: m.schedules_retry() }));
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});

it('shows translated loading feedback until the prepare read resolves', async () => {
  let resolveRead: (value: {
    events: (typeof EVENT)[];
    dayMarkers: string[];
    totals: { blocks: number; needsAttention: number };
  }) => void = () => {};
  api.getCycleParticipation.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(
    await screen.findByRole('status', { name: m.schedules_loading() }),
  ).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  await act(async () =>
    resolveRead({
      events: [EVENT],
      dayMarkers: ['2027-01-03'],
      totals: { blocks: 1, needsAttention: 0 },
    }),
  );
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});

it('keeps the prepare rows on screen while a refetch is in flight', async () => {
  api.getCycleParticipation.mockResolvedValue({
    events: [EVENT],
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 0 },
  });
  const { queryClient } = renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const rowId = `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`;
  expect(await screen.findByTestId(rowId)).toBeVisible();

  await startHangingRefetch({
    queryClient,
    read: api.getCycleParticipation,
  });

  expect(screen.getByTestId(rowId)).toBeVisible();
  expect(
    screen.queryByRole('status', { name: m.schedules_loading() }),
  ).not.toBeInTheDocument();
});

it.each([
  'schedules',
  'participation',
] as const)('scrolls to the hash row after the delayed %s read resolves', async (read) => {
  let resolveRead: () => void = () => {};
  const pendingRead = new Promise<void>((resolve) => {
    resolveRead = resolve;
  });
  const query =
    read === 'schedules' ? api.getSchedule : api.getCycleParticipation;
  const response =
    read === 'schedules'
      ? SCHEDULE
      : {
          events: [EVENT],
          dayMarkers: ['2027-01-03'],
          totals: { blocks: 1, needsAttention: 0 },
        };
  query.mockReturnValue(pendingRead.then(() => response));
  const scroll = vi.fn();
  const previous = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  const lookup = vi.spyOn(document, 'getElementById');
  try {
    const { router } = renderRoute({
      initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}#event-time-block-${BLOCK.eventTimeBlock.id}`,
      churchTimezone: 'America/Sao_Paulo',
    });
    await screen.findByRole('status', { name: m.schedules_loading() });
    await waitFor(() => expect(router.state.status).toBe('idle'));
    await waitFor(() =>
      expect(lookup).toHaveBeenCalledWith(
        `event-time-block-${BLOCK.eventTimeBlock.id}`,
      ),
    );
    await act(async () => resolveRead());
    const row = await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    );
    await waitFor(() => expect(scroll.mock.contexts).toContain(row));
  } finally {
    lookup.mockRestore();
    HTMLElement.prototype.scrollIntoView = previous;
  }
});

it('disables Ask while Shifts are flagged and links the affected rows in Church Timezone', async () => {
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 34,
    shiftCount: 12,
    eventCount: 9,
    flaggedBlocks: [
      {
        eventTimeBlockId: BLOCK.eventTimeBlock.id,
        startsAt: BLOCK.eventTimeBlock.startTime,
      },
    ],
    rolesWithoutHolders: [],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByText(m.prepare_ask_flagged());
  const ask = screen.getByRole('button', { name: m.prepare_ask() });
  expect(ask).toBeDisabled();
  expect(screen.getByText(m.prepare_ask_flagged())).toBeVisible();
  expect(
    screen.getByRole('link', { name: '03/01/2027 22:00' }),
  ).toHaveAttribute(
    'href',
    `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/${BLOCK.eventTimeBlock.id}`,
  );
});

// An all-cancelled Schedule reads as `not_serving`; a live block with no Shifts stays `to_prepare`.
it.each([
  'to_prepare',
  'not_serving',
])('shows Ask disabled with its reason when a %s Schedule has no live Shifts', async (stage) => {
  const user = userEvent.setup();
  api.getSchedule.mockResolvedValue({ ...SCHEDULE, stage });
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 0,
    shiftCount: 0,
    eventCount: 0,
    flaggedBlocks: [],
    rolesWithoutHolders: [],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_ask_no_live_shifts())).toBeVisible();
  const ask = screen.getByRole('button', { name: m.prepare_ask() });
  expect(ask).toHaveAttribute('aria-disabled', 'true');
  expect(ask).toHaveAccessibleDescription(m.prepare_ask_no_live_shifts());
  expect(ask).toBeEnabled();
  ask.focus();
  expect(ask).toHaveFocus();
  await user.click(ask);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('previews counts and unheld Roles with People and Invitations links that open in new tabs', async () => {
  const user = userEvent.setup();
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 34,
    shiftCount: 12,
    eventCount: 9,
    flaggedBlocks: [],
    rolesWithoutHolders: [
      { roleId: 'guitar', roleName: 'Guitarrista', shiftCount: 3 },
      { roleId: 'keys', roleName: 'Tecladista', shiftCount: 1 },
    ],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  expect(ask).not.toHaveAttribute('aria-disabled');
  expect(
    screen.queryByText(m.prepare_ask_no_live_shifts()),
  ).not.toBeInTheDocument();
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(
    m.prepare_ask_counts({
      volunteers: '34 Voluntários',
      shifts: '12 Turnos',
      events: '9 Eventos',
    }),
  );
  expect(dialog).toHaveTextContent(
    m.prepare_ask_role_warning({ role: 'Guitarrista', shifts: '3 Turnos' }),
  );
  expect(dialog).toHaveTextContent(
    m.prepare_ask_role_warning({ role: 'Tecladista', shifts: '1 Turno' }),
  );
  for (const [label, href] of [
    [m.nav_people(), '/app/people'],
    [m.nav_invitations(), '/app/invitations'],
  ]) {
    const links = within(dialog).getAllByRole('link', { name: label });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  }
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask_deadline() }),
  ).toBeVisible();
});

it('keeps the dialog confirmation disabled and explains when no Volunteers are eligible', async () => {
  const user = userEvent.setup();
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 0,
    shiftCount: 1,
    eventCount: 1,
    flaggedBlocks: [],
    rolesWithoutHolders: [],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(
    m.prepare_ask_counts({
      volunteers: '0 Voluntários',
      shifts: '1 Turno',
      events: '1 Evento',
    }),
  );
  expect(dialog).toHaveTextContent(m.prepare_ask_zero_eligible());
  const confirm = within(dialog).getByRole('button', { name: m.prepare_ask() });
  expect(confirm).toBeDisabled();
  await user.click(confirm);
  expect(api.askScheduleAvailability).not.toHaveBeenCalled();
});

it.each([
  false,
  true,
])('asks once with a selected Deadline (cleared: %s), refreshes Schedules and enters asking', async (clearDeadline) => {
  const user = userEvent.setup();
  let finishAsk: () => void = () => {};
  api.askScheduleAvailability.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishAsk = () => {
          api.getSchedule.mockResolvedValue({
            ...SCHEDULE,
            stage: 'asking',
            asking: { confirmed: 0, asked: 34 },
          });
          api.getCycleParticipation.mockResolvedValue({
            dayMarkers: ['2027-01-03'],
            totals: { blocks: 1, needsAttention: 0 },
            events: [
              {
                ...EVENT,
                participation: {
                  ...EVENT.participation,
                  state: 'availability_requested',
                },
              },
            ],
          });
          resolve({
            createdCheckCount: 34,
            notifiedVolunteerCount: 34,
            rolesWithoutHolders: [],
          });
        };
      }),
  );
  const { queryClient } = renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  await pickCalendarDate({
    user,
    trigger: screen.getByTestId('prepare-ask-deadline'),
    date: '2027-01-02',
  });
  expect(screen.getByTestId('prepare-ask-deadline')).toHaveTextContent(
    '02/01/2027',
  );
  if (clearDeadline) {
    await user.click(
      screen.getByRole('button', { name: m.date_picker_clear() }),
    );
    expect(screen.getByTestId('prepare-ask-deadline')).toHaveTextContent(
      m.date_picker_placeholder(),
    );
  }
  await user.click(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  );
  await waitFor(() =>
    expect(api.askScheduleAvailability).toHaveBeenCalledWith(
      CYCLE_ID,
      clearDeadline
        ? { ministryId: MINISTRY_ID }
        : { ministryId: MINISTRY_ID, answerBy: '2027-01-02' },
    ),
  );
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask_pending() }),
  ).toBeDisabled();
  await user.click(
    within(dialog).getByRole('button', { name: m.prepare_ask_pending() }),
  );
  expect(api.askScheduleAvailability).toHaveBeenCalledTimes(1);
  await act(async () => finishAsk());
  expect(await screen.findByText(m.schedules_asking_stage())).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: m.prepare_ask() }),
  ).not.toBeInTheDocument();
  expect(
    queryClient.getQueryData([
      'prepare-schedules',
      'one',
      MINISTRY_ID,
      CYCLE_ID,
    ]),
  ).toMatchObject({
    stage: 'asking',
  });
});

it('keeps the selected Deadline and localized refusal visible so a failed Ask can be retried', async () => {
  const user = userEvent.setup();
  api.askScheduleAvailability.mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 422,
      data: {
        error: 'VALIDATION_ERROR',
        message: 'Confira o Prazo e tente novamente.',
      },
    },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  await pickCalendarDate({
    user,
    trigger: screen.getByTestId('prepare-ask-deadline'),
    date: '2027-01-02',
  });
  await user.click(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  );
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Confira o Prazo e tente novamente.',
  );
  expect(screen.getByTestId('prepare-ask-deadline')).toHaveTextContent(
    '02/01/2027',
  );
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  ).toBeEnabled();
  expect(
    screen.queryByText(m.schedules_asking_stage()),
  ).not.toBeInTheDocument();
});

it('shows the authoritative flagged-block refusal inside the dialog when another tab changes a Shift', async () => {
  const user = userEvent.setup();
  api.askScheduleAvailability.mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 409,
      data: {
        error: 'ASK_BLOCKED_FLAGGED_SHIFTS',
        message: m.prepare_ask_flagged(),
        flaggedBlocks: [
          {
            eventTimeBlockId: BLOCK.eventTimeBlock.id,
            startsAt: BLOCK.eventTimeBlock.startTime,
          },
        ],
      },
    },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  );
  const link = await within(dialog).findByRole('link', {
    name: '03/01/2027 22:00',
  });
  expect(link).toHaveAttribute(
    'href',
    `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/${BLOCK.eventTimeBlock.id}`,
  );
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  ).toBeDisabled();
});

it('keeps the Ask control on screen, disabled, while the preview refetches', async () => {
  const { queryClient } = renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());

  await startHangingRefetch({ queryClient, read: api.getAskPreview });

  expect(screen.getByRole('button', { name: m.prepare_ask() })).toBeDisabled();
  expect(
    screen.getByRole('status', { name: m.prepare_ask_loading() }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('status', { name: m.schedules_loading() }),
  ).not.toBeInTheDocument();
});

it('keeps Ask disabled while the preview loads, then retries a failed preview', async () => {
  const user = userEvent.setup();
  let rejectPreview: (error: Error) => void = () => {};
  api.getAskPreview.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectPreview = reject;
    }),
  );
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  expect(ask).toBeDisabled();
  expect(
    screen.getByRole('status', { name: m.prepare_ask_loading() }),
  ).toBeVisible();
  await act(async () => rejectPreview(new Error('offline')));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    m.prepare_ask_preview_error(),
  );
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 1,
    shiftCount: 1,
    eventCount: 1,
    flaggedBlocks: [],
    rolesWithoutHolders: [],
  });
  await user.click(screen.getByRole('button', { name: m.schedules_retry() }));
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    m.prepare_ask_counts({
      volunteers: '1 Voluntário',
      shifts: '1 Turno',
      events: '1 Evento',
    }),
  );
});

it.each([
  'en',
  'pt-BR',
] as const)('renders the singular Ask dialog through the %s catalog', async (locale) => {
  overwriteGetLocale(() => locale);
  const user = userEvent.setup();
  api.getAskPreview.mockResolvedValue({
    eligibleVolunteerCount: 1,
    shiftCount: 1,
    eventCount: 1,
    flaggedBlocks: [],
    rolesWithoutHolders: [],
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog', { name: m.prepare_ask() });
  const volunteers = m.prepare_ask_volunteers_one();
  const shifts = m.prepare_ask_shifts_one();
  const events = m.prepare_ask_events_one();
  const counts = m.prepare_ask_counts({ volunteers, shifts, events });
  expect(dialog).toHaveTextContent(counts);
  expect(dialog).toHaveTextContent(m.prepare_ask_deadline_hint());
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask_deadline() }),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('button', { name: m.prepare_ask_cancel() }),
  ).toBeVisible();
});

it('refreshes the stage after another tab has already Asked so the dialog cannot reopen', async () => {
  const user = userEvent.setup();
  api.askScheduleAvailability.mockImplementation(async () => {
    api.getSchedule.mockResolvedValue({ ...SCHEDULE, stage: 'asking' });
    throw {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: 'ILLEGAL_STATE_TRANSITION',
          message: 'A disponibilidade já foi solicitada.',
        },
      },
    };
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const ask = await screen.findByRole('button', { name: m.prepare_ask() });
  await waitFor(() => expect(ask).toBeEnabled());
  await user.click(ask);
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: m.prepare_ask() }),
  );
  expect(await screen.findByText(m.schedules_asking_stage())).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: m.prepare_ask() }),
  ).not.toBeInTheDocument();
});

it('restores validated URL filters on entry and clears them without losing unrelated search state', async () => {
  const user = userEvent.setup();
  const { router } = renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}?q=Sunday&needsAttention=true&timeFrom=09%3A00&timeTo=invalid&swapRequest=request`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  expect(api.getCycleParticipation).toHaveBeenLastCalledWith(CYCLE_ID, {
    ministryId: MINISTRY_ID,
    day: undefined,
    q: 'Sunday',
    timeMode: 'starts',
    timeFrom: '09:00',
    timeTo: undefined,
    needsAttention: 'true',
  });
  await user.click(
    screen.getByRole('button', {
      name: m.prepare_clear_filters(),
    }),
  );
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ swapRequest: 'request' }),
  );
  expect(api.getCycleParticipation).toHaveBeenLastCalledWith(CYCLE_ID, {
    ministryId: MINISTRY_ID,
  });
});
