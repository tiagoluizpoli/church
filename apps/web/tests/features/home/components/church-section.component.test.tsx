import { m } from '@church/i18n/messages';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { focusManager, QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurchSection } from '@/features/home/components/church-section';
import { homeSectionQueryPrefix } from '@/features/home/lib/home-query-keys';
import type {
  GetSetupProgress200,
  ListCycles200CyclesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  getSetupProgress: vi.fn(),
  listCycles: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({ setupApi: api, adminApi: api }));

const CHURCH_ID = 'church-1';
const USER_ID = 'user-1';
const CHURCH_TIMEZONE = 'America/Sao_Paulo';
/** 23:00 on 2026-11-10 in São Paulo, already 2026-11-11 in UTC and Kolkata. */
const CHURCH_LATE_EVENING = '2026-11-11T02:00:00.000Z';

const NOTHING_SET_UP: GetSetupProgress200 = {
  churchId: CHURCH_ID,
  hasMinistry: false,
  hasMinistryWithSectorsAndRoles: false,
  hasInvitedLeader: false,
  hasEventTemplate: false,
  hasEverSentCycle: false,
};

interface CycleInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  state: ListCycles200CyclesItem['state'];
}

function cycle(input: CycleInput): ListCycles200CyclesItem {
  return {
    ...input,
    churchId: CHURCH_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const NOVEMBER_SENT = cycle({
  id: 'november',
  name: 'November',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  state: 'sent',
});
const DECEMBER_DRAFT = cycle({
  id: 'december',
  name: 'December',
  startDate: '2026-12-01',
  endDate: '2026-12-31',
  state: 'draft',
});
const OCTOBER_PAST = cycle({
  id: 'october',
  name: 'October',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  state: 'past',
});

function givenProgress(progress: Partial<GetSetupProgress200>) {
  api.getSetupProgress.mockResolvedValue({ ...NOTHING_SET_UP, ...progress });
}

/** Repository order: start day desc, end day desc, id asc. */
function givenCycles(cycles: ListCycles200CyclesItem[]) {
  api.listCycles.mockResolvedValue({ cycles });
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => <ChurchSection churchId={CHURCH_ID} userId={USER_ID} />,
  });
  const cycles = createRoute({ getParentRoute: () => root, path: '/cycles' });
  const cycleDetail = createRoute({
    getParentRoute: () => root,
    path: '/cycles/$cycleId',
  });
  const router = createRouter({
    routeTree: root.addChildren([cycles, cycleDetail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  renderWithProviders(<RouterProvider router={router} />, {
    churchTimezone: CHURCH_TIMEZONE,
    queryClient,
  });
  return { queryClient };
}

const checklist = () =>
  screen.queryByRole('heading', { name: m.home_setup_title() });
const nextCycle = () =>
  screen.queryByRole('heading', { name: m.home_next_cycle_title() });
const planCycle = () =>
  screen.queryByRole('link', { name: m.home_next_cycle_plan() });

async function stepFor(label: string) {
  const link = await screen.findByRole('link', {
    name: `${label} ${m.home_opens_new_tab()}`,
  });
  const item = link.closest('li');
  if (!item) throw new Error(`No checklist item for ${label}`);
  return { link, item };
}

beforeEach(() => {
  vi.resetAllMocks();
  setTestClock({ instant: parseInstant({ value: CHURCH_LATE_EVENING }) });
});

afterEach(() => {
  resetClock();
});

describe('ChurchSection setup checklist', () => {
  it('ticks each step from the read, independently', async () => {
    givenProgress({ hasMinistry: true, hasInvitedLeader: true });
    renderSection();

    const ticks = [
      [m.home_setup_ministry(), m.home_setup_done()],
      [m.home_setup_sectors_roles(), m.home_setup_to_do()],
      [m.home_setup_leader(), m.home_setup_done()],
      [m.home_setup_template(), m.home_setup_to_do()],
      [m.home_setup_cycle(), m.home_setup_to_do()],
    ];
    for (const [label, status] of ticks) {
      const { item } = await stepFor(label);
      expect(within(item).getByText(status)).toBeInTheDocument();
    }
  });

  it('opens each step on its owning page in a new tab', async () => {
    givenProgress({});
    renderSection();

    const targets = [
      [m.home_setup_ministry(), '/ministries'],
      [m.home_setup_sectors_roles(), '/ministries'],
      [m.home_setup_leader(), '/invitations'],
      [m.home_setup_template(), '/event-templates'],
      [m.home_setup_cycle(), '/cycles'],
    ];
    for (const [label, href] of targets) {
      const { link } = await stepFor(label);
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('refreshes progress when Home regains focus', async () => {
    givenProgress({});
    renderSection();
    const before = await stepFor(m.home_setup_template());
    expect(within(before.item).getByText(m.home_setup_to_do())).toBeVisible();

    givenProgress({ hasEventTemplate: true });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    const after = await stepFor(m.home_setup_template());
    expect(
      await within(after.item).findByText(m.home_setup_done()),
    ).toBeInTheDocument();
    act(() => focusManager.setFocused(undefined));
  });

  it('shows loading, never a checklist or Plan a cycle, while progress loads', async () => {
    api.getSetupProgress.mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(
      await screen.findByRole('status', { name: m.home_setup_loading() }),
    ).toBeVisible();
    expect(checklist()).not.toBeInTheDocument();
    expect(planCycle()).not.toBeInTheDocument();
  });

  it('shows a retryable error, never an empty or completed setup, when the read fails', async () => {
    api.getSetupProgress.mockRejectedValueOnce(new Error('down'));
    renderSection();

    expect(await screen.findByText(m.home_setup_load_error())).toBeVisible();
    expect(checklist()).not.toBeInTheDocument();
    expect(nextCycle()).not.toBeInTheDocument();
    expect(planCycle()).not.toBeInTheDocument();

    givenProgress({ hasMinistry: true });
    await userEvent.click(screen.getByRole('button', { name: m.home_retry() }));

    expect(await screen.findByText(m.home_setup_title())).toBeVisible();
    expect(
      screen.queryByText(m.home_setup_load_error()),
    ).not.toBeInTheDocument();
  });

  it('keeps every read under the Church section key Home clears on capacity loss and Church switch', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([]);
    const { queryClient } = renderSection();
    await screen.findByText(m.home_next_cycle_none());

    const cached = queryClient
      .getQueryCache()
      .findAll({ queryKey: homeSectionQueryPrefix({ section: 'church' }) });
    expect(cached).toHaveLength(2);
    for (const query of cached) {
      expect(query.queryKey).toEqual(
        expect.arrayContaining([CHURCH_ID, USER_ID]),
      );
    }
  });
});

describe('ChurchSection next-Cycle card', () => {
  it('replaces the checklist for good once any Cycle was sent, even if none is upcoming', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([OCTOBER_PAST]);
    renderSection();

    expect(await screen.findByText(m.home_next_cycle_none())).toBeVisible();
    expect(checklist()).not.toBeInTheDocument();
    expect(planCycle()).toHaveAttribute('href', '/cycles');
  });

  it('offers Continue on the latest draft', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([DECEMBER_DRAFT, OCTOBER_PAST]);
    renderSection();

    expect(
      await screen.findByText(
        m.home_next_cycle_draft({ cycleName: 'December' }),
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: m.home_next_cycle_continue() }),
    ).toHaveAttribute('href', '/cycles/december');
  });

  it('shows the end date of a Sent Cycle', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([NOVEMBER_SENT, OCTOBER_PAST]);
    renderSection();

    expect(
      await screen.findByText(
        m.home_next_cycle_sent({
          cycleName: 'November',
          endDate: '30/11/2026',
        }),
      ),
    ).toBeVisible();
    expect(planCycle()).not.toBeInTheDocument();
  });

  it('prefers a newer draft over an older current Sent Cycle', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([DECEMBER_DRAFT, NOVEMBER_SENT]);
    renderSection();

    expect(
      await screen.findByText(
        m.home_next_cycle_draft({ cycleName: 'December' }),
      ),
    ).toBeVisible();
    expect(screen.queryByText(/November/)).not.toBeInTheDocument();
  });

  it('counts the last day in the Church Timezone, whatever the ambient zone', async () => {
    givenProgress({ hasEverSentCycle: true });
    // Its last day is the Church's today, though UTC and Kolkata are already on the 11th.
    const endsToday = cycle({
      id: 'ends-today',
      name: 'Ends today',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
      state: 'sent',
    });
    givenCycles([endsToday]);
    renderSection();

    expect(
      await screen.findByText(
        m.home_next_cycle_sent({
          cycleName: 'Ends today',
          endDate: '10/11/2026',
        }),
      ),
    ).toBeVisible();
  });

  it('skips a Cycle whose last day has elapsed in the Church Timezone', async () => {
    givenProgress({ hasEverSentCycle: true });
    const endedYesterday = cycle({
      id: 'ended',
      name: 'Ended',
      startDate: '2026-11-01',
      endDate: '2026-11-09',
      state: 'sent',
    });
    givenCycles([endedYesterday]);
    renderSection();

    expect(await screen.findByText(m.home_next_cycle_none())).toBeVisible();
  });

  it('shows a retryable error, never Plan a cycle, when the Cycle read fails', async () => {
    givenProgress({ hasEverSentCycle: true });
    api.listCycles.mockRejectedValueOnce(new Error('down'));
    renderSection();

    expect(
      await screen.findByText(m.home_next_cycle_load_error()),
    ).toBeVisible();
    expect(planCycle()).not.toBeInTheDocument();

    givenCycles([NOVEMBER_SENT]);
    await userEvent.click(screen.getByRole('button', { name: m.home_retry() }));

    expect(
      await screen.findByText(
        m.home_next_cycle_sent({
          cycleName: 'November',
          endDate: '30/11/2026',
        }),
      ),
    ).toBeVisible();
  });

  it('renders in pt-BR from the catalog', async () => {
    givenProgress({ hasEverSentCycle: true });
    givenCycles([]);
    renderSection();

    await screen.findByText(m.home_next_cycle_none());
    expect(m.home_next_cycle_plan({}, { locale: 'pt-BR' })).toBe(
      'Planejar um ciclo',
    );
    expect(m.home_setup_cycle({}, { locale: 'pt-BR' })).toBe(
      'Planeje e envie um ciclo',
    );
  });
});
