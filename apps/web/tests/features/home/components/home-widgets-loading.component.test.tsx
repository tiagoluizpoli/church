import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurchSection } from '@/features/home/components/church-section';
import { LeadershipSection } from '@/features/home/components/leadership-section';
import { NextCycleCard } from '@/features/home/components/next-cycle-card';
import {
  AdminSummary,
  NotificationSummary,
  ScheduleSummary,
} from '@/features/home/components/summary-widgets';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({
  getSetupProgress: vi.fn(),
  getCycleAnchors: vi.fn(),
  listSchedules: vi.fn(),
  listMinistryDirectory: vi.fn(),
  listPeople: vi.fn(),
  listInvitations: vi.fn(),
  getNotifications: vi.fn(),
}));
vi.mock('@/utils/api-instances', () => ({
  setupApi: api,
  adminApi: api,
  peopleApi: api,
  invitationsApi: api,
  notificationsApi: api,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

const props = { churchId: 'church-1', userId: 'user-1' };
const never = () => new Promise(() => {});

interface Surface {
  name: string;
  /** Mocks every read the surface makes with `value`. */
  given: (value: unknown) => void;
  ui: React.ReactElement;
  /** The loading region's accessible name. */
  label: () => string;
  /** Text shown once data is in. */
  loaded: () => string | RegExp;
  data: unknown;
}

const counts = { counts: {}, schedules: [] };
const surfaces: Surface[] = [
  {
    name: 'ChurchSection',
    given: (v) => api.getSetupProgress.mockReturnValue(v),
    ui: <ChurchSection {...props} />,
    label: () => m.home_setup_loading(),
    loaded: () => m.home_setup_section(),
    data: { hasEverSentCycle: false },
  },
  {
    name: 'NextCycleCard',
    given: (v) => api.getCycleAnchors.mockReturnValue(v),
    ui: <NextCycleCard {...props} />,
    label: () => m.home_cycles(),
    loaded: () => m.home_current_cycle(),
    data: { current: null, next: null },
  },
  {
    name: 'LeadershipSection',
    given: (v) => api.listSchedules.mockReturnValue(v),
    ui: <LeadershipSection {...props} scope="leader" />,
    label: () => m.home_attention_schedules(),
    loaded: () => m.home_leadership_empty(),
    data: counts,
  },
  {
    name: 'ScheduleSummary',
    given: (v) => api.listSchedules.mockReturnValue(v),
    ui: <ScheduleSummary {...props} scope="leader" />,
    label: () => m.home_summary(),
    loaded: () => m.schedules_to_prepare(),
    data: { schedules: [], counts: { toPrepare: 0 } },
  },
  {
    name: 'AdminSummary',
    given: (v) => {
      api.listPeople.mockReturnValue(v);
      api.listInvitations.mockReturnValue(v);
      api.listMinistryDirectory.mockReturnValue(v);
    },
    ui: <AdminSummary {...props} />,
    label: () => m.home_section_church(),
    loaded: () => m.home_section_church(),
    data: { counts: {} },
  },
  {
    name: 'NotificationSummary',
    given: (v) => api.getNotifications.mockReturnValue(v),
    ui: <NotificationSummary {...props} />,
    label: () => m.home_notifications(),
    loaded: () => new RegExp(m.home_notifications()),
    data: { items: [], unreadCount: 0 },
  },
];

beforeEach(() => vi.resetAllMocks());

describe.each(surfaces)('$name loading', (surface) => {
  it('shows its skeleton only after the pending delay on first load', async () => {
    surface.given(never());
    renderWithProviders(surface.ui);
    const region = screen.getByRole('status', { name: surface.label() });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps its data, with no skeleton, while a refetch is in flight', async () => {
    const queryClient = new QueryClient();
    surface.given(Promise.resolve(surface.data));
    renderWithProviders(surface.ui, { queryClient });
    expect((await screen.findAllByText(surface.loaded()))[0]).toBeVisible();
    surface.given(never());
    void queryClient.invalidateQueries();
    await waitFor(() => expect(queryClient.isFetching()).toBeGreaterThan(0));
    expect(screen.getAllByText(surface.loaded())[0]).toBeVisible();
    expect(screen.queryByRole('status', { name: surface.label() })).toBeNull();
  });
});
