import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCK,
  BLOCK_ID,
  CYCLE_ID,
  EDITOR_PATH,
  EVENT,
  MINISTRY_ID,
  ROLES,
  SCHEDULE,
  SECTORS,
} from './preparation-block.fixtures';
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
  saveEventTimeBlockPreparation: vi.fn(),
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

it('loads a deep link with Home-first Schedule and Church-Timezone block breadcrumbs using only leader-callable reads', async () => {
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox', { name: m.usual_setup_serves_label() });
  const breadcrumbs = screen.getByTestId('breadcrumbs');
  await waitFor(() =>
    expect(
      within(breadcrumbs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      m.nav_home(),
      m.nav_schedules(),
      'Worship · January 2027',
      '03/01/2027 22:00 – 04/01/2027 02:00',
    ]),
  );
  expect(api.listMinistries).not.toHaveBeenCalled();
  expect(api.listScheduleSummaries).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Sunday · Night' })).toBeVisible();
});

const MORNING_ID = '66666666-6666-4666-8666-666666666666';
const MORNING = {
  ...BLOCK,
  eventTimeBlock: { ...BLOCK.eventTimeBlock, id: MORNING_ID, label: 'Morning' },
  included: false,
  shifts: [],
};
const LIST_PATH = `/schedules/${MINISTRY_ID}/${CYCLE_ID}`;

describe('preparing beside the retained Schedule list', () => {
  // jsdom has no scrolling; the router and the list both scroll to a row hash.
  const scroll = vi.fn();
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = scroll;
    api.getCycleParticipation.mockResolvedValue({
      events: [{ ...EVENT, eventTimeBlocks: [BLOCK, MORNING] }],
    });
  });

  it('opens a block in a non-modal panel beside the filtered list and moves focus into its editor', async () => {
    const user = userEvent.setup();
    renderRoute({
      initialPath: LIST_PATH,
      churchTimezone: 'America/Sao_Paulo',
    });
    const filter = await screen.findByRole('textbox', {
      name: m.prepare_filter_name(),
    });
    await user.type(filter, 'Sunday');
    await user.click(
      screen.getByTestId(`prepare-event-time-block-row-${BLOCK_ID}`),
    );
    const heading = await screen.findByRole('heading', {
      name: 'Sunday · Night',
    });
    expect(heading).toHaveFocus();
    expect(screen.getByTestId('prepare-block-panel')).toContainElement(heading);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(filter).toHaveValue('Sunday');
    expect(
      screen.getByTestId(`prepare-event-time-block-row-${BLOCK_ID}`),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByTestId(`prepare-event-time-block-row-${MORNING_ID}`),
    ).not.toHaveAttribute('aria-current');
  });

  it('switches blocks in the same panel only after the dirty draft is discarded', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute({
      initialPath: EDITOR_PATH,
      churchTimezone: 'America/Sao_Paulo',
    });
    const stage = await screen.findByRole('spinbutton', {
      name: /Singer.*Stage|Stage.*Singer/,
    });
    await user.type(stage, '9');
    await user.click(
      screen.getByTestId(`prepare-event-time-block-row-${MORNING_ID}`),
    );
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      m.prepare_block_leave_title(),
    );
    await user.click(
      screen.getByRole('button', { name: m.prepare_block_stay() }),
    );
    expect(stage).toHaveValue(29);
    expect(router.state.location.pathname).toBe(EDITOR_PATH);
    await user.click(
      screen.getByTestId(`prepare-event-time-block-row-${MORNING_ID}`),
    );
    await user.click(
      screen.getByRole('button', { name: m.prepare_block_leave() }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Sunday · Morning' }),
    ).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Sunday · Night' }),
    ).not.toBeInTheDocument();
    expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
  });

  it('keeps a pending save in its panel when another block is chosen', async () => {
    api.saveEventTimeBlockPreparation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { router } = renderRoute({
      initialPath: EDITOR_PATH,
      churchTimezone: 'America/Sao_Paulo',
    });
    const stage = await screen.findByRole('spinbutton', {
      name: /Singer.*Stage|Stage.*Singer/,
    });
    await user.type(stage, '9');
    await user.click(
      screen.getByRole('button', { name: m.usual_setup_save() }),
    );
    await user.click(
      screen.getByTestId(`prepare-event-time-block-row-${MORNING_ID}`),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(m.prepare_block_pending_navigation());
    expect(
      within(dialog).getByRole('button', { name: m.prepare_block_leave() }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole('button', { name: m.prepare_block_stay() }),
    );
    expect(router.state.location.pathname).toBe(EDITOR_PATH);
    expect(stage).toHaveValue(29);
  });

  it('closes the panel on Cancel and returns focus to the block row in the same list context', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute({
      initialPath: LIST_PATH,
      churchTimezone: 'America/Sao_Paulo',
    });
    const filter = await screen.findByRole('textbox', {
      name: m.prepare_filter_name(),
    });
    await user.type(filter, 'Sun');
    await user.click(
      screen.getByTestId(`prepare-event-time-block-row-${BLOCK_ID}`),
    );
    await user.click(
      await screen.findByRole('button', { name: m.usual_setup_cancel() }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(LIST_PATH));
    await waitFor(() =>
      expect(
        screen.getByTestId(`prepare-event-time-block-row-${BLOCK_ID}`),
      ).toHaveFocus(),
    );
    expect(screen.queryByTestId('prepare-block-panel')).not.toBeInTheDocument();
    expect(scroll.mock.contexts).toContain(
      screen.getByTestId(`prepare-event-time-block-row-${BLOCK_ID}`),
    );
    expect(filter).toHaveValue('Sun');
  });
});
