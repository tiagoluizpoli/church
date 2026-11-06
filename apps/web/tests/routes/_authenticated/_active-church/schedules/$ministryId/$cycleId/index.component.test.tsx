import { m } from '@church/i18n/messages';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
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
import { renderRoute } from '@/tests/setup/render-route';

const api = vi.hoisted(() => ({
  listMinistries: vi.fn(),
  listScheduleSummaries: vi.fn(),
  getCycleParticipation: vi.fn(),
  listSchedules: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  api.listMinistries.mockRejectedValue(new Error('admin-only read'));
  api.listScheduleSummaries.mockResolvedValue({ cycles: [] });
  api.getCycleParticipation.mockResolvedValue({ events: [EVENT] });
  api.listSchedules.mockResolvedValue({ schedules: [SCHEDULE] });
  api.listSectors.mockResolvedValue({ sectors: SECTORS });
  api.listMinistryRoles.mockResolvedValue({ roles: ROLES });
  activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
    churches: [],
  });
});

it('shows a leader-callable Schedule with a link to edit one Time block and no inline or batched controls', async () => {
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  const row = await screen.findByTestId(
    'prepare-event-time-block-row-33333333-3333-4333-8333-333333333333',
  );
  expect(row).toHaveAttribute(
    'href',
    `/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/33333333-3333-4333-8333-333333333333`,
  );
  expect(screen.getByTestId('prepare-calendar')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(within(row).queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('save-and-ask-availability-button'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: m.prepare_open_builder() }),
  ).toHaveAttribute('href', `/schedules/${MINISTRY_ID}/${CYCLE_ID}/assign`);
  expect(api.listMinistries).not.toHaveBeenCalled();
  expect(api.listScheduleSummaries).not.toHaveBeenCalled();
});

it.each([
  'past',
  'published',
] as const)('shows a read-only Schedule for %s with navigation to view the block', async (state) => {
  api.listSchedules.mockResolvedValue({
    schedules: [
      {
        ...SCHEDULE,
        cycle: { ...SCHEDULE.cycle, state: state === 'past' ? 'past' : 'sent' },
        stage: state === 'published' ? 'published' : 'to_prepare',
      },
    ],
  });
  api.getCycleParticipation.mockResolvedValue({
    events: [
      {
        ...EVENT,
        participation: {
          ...EVENT.participation,
          state: state === 'published' ? 'published' : 'preparing',
        },
      },
    ],
  });
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_block_read_only())).toBeVisible();
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toHaveAttribute('href');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('distinguishes an empty Schedule from filters with no matches', async () => {
  api.getCycleParticipation.mockResolvedValue({ events: [] });
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_empty())).toBeVisible();
  expect(screen.queryByText(m.prepare_filter_empty())).not.toBeInTheDocument();
});

it('opens the nested block page with no page-level leave confirmation', async () => {
  const user = userEvent.setup();
  const { router } = renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
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
    `/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/${BLOCK.eventTimeBlock.id}`,
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('keeps a no-match filter state distinct and restores rows when cleared without a new request', async () => {
  const user = userEvent.setup();
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  const requests = api.getCycleParticipation.mock.calls.length;
  const filter = screen.getByRole('textbox', { name: m.prepare_filter_name() });
  await user.type(filter, 'missing');
  expect(screen.getByText(m.prepare_filter_empty())).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  await user.clear(filter);
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
  expect(api.getCycleParticipation).toHaveBeenCalledTimes(requests);
});

it('filters a block crossing UTC midnight by its Church calendar day', async () => {
  const user = userEvent.setup();
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId(
    `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
  );
  await user.click(screen.getByTestId('prepare-calendar-day-2027-01-04'));
  expect(screen.getByText(m.prepare_filter_empty())).toBeVisible();
  await user.click(screen.getByTestId('prepare-calendar-day-2027-01-03'));
  expect(
    screen.getByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});

it.each([
  'schedules',
  'participation',
] as const)('shows no-access for a forbidden %s read', async (read) => {
  const query =
    read === 'schedules' ? api.listSchedules : api.getCycleParticipation;
  query.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
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
    api.listSchedules.mockResolvedValue({ schedules: [] });
  else
    api.getCycleParticipation.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
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
    read === 'schedules' ? api.listSchedules : api.getCycleParticipation;
  query.mockRejectedValue(new Error('Network unavailable'));
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.prepare_schedule_error())).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  api.listSchedules.mockResolvedValue({ schedules: [SCHEDULE] });
  api.getCycleParticipation.mockResolvedValue({ events: [EVENT] });
  await user.click(screen.getByRole('button', { name: m.schedules_retry() }));
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});

it('shows translated loading feedback until the prepare read resolves', async () => {
  let resolveRead: (value: { events: (typeof EVENT)[] }) => void = () => {};
  api.getCycleParticipation.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  renderRoute({
    initialPath: `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(
    await screen.findByRole('status', { name: m.schedules_loading() }),
  ).toBeVisible();
  expect(screen.queryByText(m.prepare_empty())).not.toBeInTheDocument();
  await act(async () => resolveRead({ events: [EVENT] }));
  expect(
    await screen.findByTestId(
      `prepare-event-time-block-row-${BLOCK.eventTimeBlock.id}`,
    ),
  ).toBeVisible();
});
