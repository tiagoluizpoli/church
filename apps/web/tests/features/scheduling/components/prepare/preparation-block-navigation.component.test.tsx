import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  EDITOR_PATH,
  EVENT,
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
