import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
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
import {
  adminApi,
  invitationsApi,
  notificationsApi,
  peopleApi,
} from '@/utils/api-instances';

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listSchedules: vi.fn().mockResolvedValue({
      schedules: [],
      counts: { ['to_prepare']: 2, asking: 3, assigning: 4, published: 5 },
    }),
    getCycleAnchors: vi.fn().mockResolvedValue({ current: null, next: null }),
    listMinistryDirectory: vi
      .fn()
      .mockResolvedValue({ counts: { review: 3, noSectors: 1 } }),
  },
  setupApi: {
    getSetupProgress: vi.fn().mockResolvedValue({ hasEverSentCycle: true }),
  },
  peopleApi: {
    listPeople: vi.fn().mockResolvedValue({
      counts: {
        total: 12,
        admins: 1,
        leaders: 2,
        volunteers: 7,
        withoutMinistry: 3,
      },
    }),
  },
  invitationsApi: {
    listInvitations: vi
      .fn()
      .mockResolvedValue({ counts: { pending: 4, expired: 2 } }),
  },
  notificationsApi: {
    getNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
  volunteerApi: {
    listAvailabilityChecks: vi.fn().mockResolvedValue({ checks: [] }),
    getVolunteerDashboard: vi.fn().mockResolvedValue({
      nextAssignment: null,
      upcomingAssignmentGroups: [],
    }),
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => (
    <a
      href={
        search
          ? `${to}?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`
          : to
      }
    >
      {children}
    </a>
  ),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, info: vi.fn(), warning: vi.fn() },
}));

const churchSection = () =>
  screen.queryByRole('heading', { name: m.home_section_church() });
const leadershipSection = () =>
  screen.queryByRole('heading', { name: m.home_attention_schedules() });
const servingSection = () =>
  screen.queryByRole('heading', { name: m.home_next_assignment() });

function givenCapabilities(
  input: Parameters<typeof callerCapabilitiesFixture>[0],
) {
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture(input),
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [{ churchId: DEFAULT_CHURCH_ID, name: 'St. Peter', areas: [] }],
    });
  });

  it('shows loading, never the welcome, while capabilities resolve', () => {
    callerCapabilitiesApiMock.getCallerCapabilities.mockReturnValue(
      new Promise(() => {}),
    );
    renderHomePage();

    expect(
      screen.getByRole('status', { name: m.home_loading() }),
    ).toBeVisible();
    expect(
      screen.queryByText(m.home_welcome({ churchName: 'St. Peter' })),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error, not the welcome or any section, when the read fails', async () => {
    callerCapabilitiesApiMock.getCallerCapabilities.mockRejectedValueOnce(
      new Error('down'),
    );
    renderHomePage();

    expect(await screen.findByText(m.home_load_error())).toBeVisible();
    expect(screen.queryByText(/Nothing needs you/)).not.toBeInTheDocument();
    expect(churchSection()).not.toBeInTheDocument();
    expect(leadershipSection()).not.toBeInTheDocument();
    expect(servingSection()).not.toBeInTheDocument();

    givenCapabilities({ isChurchAdmin: true });
    await userEvent.click(screen.getByRole('button', { name: m.home_retry() }));

    expect(
      await screen.findByRole('heading', { name: m.home_section_church() }),
    ).toBeVisible();
  });

  it('welcomes a plain member by Church name with no section or Ministry prompt', async () => {
    givenCapabilities({});
    renderHomePage();

    expect(
      await screen.findByText(m.home_welcome({ churchName: 'St. Peter' })),
    ).toBeVisible();
    expect(churchSection()).not.toBeInTheDocument();
    expect(leadershipSection()).not.toBeInTheDocument();
    expect(servingSection()).not.toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /Notificações · 0 não lidas/ }),
    ).toBeVisible();
  });

  it.each([
    [
      'admin without a Volunteer profile',
      { isChurchAdmin: true },
      [true, true, false],
    ],
    ['leader', { ledMinistries: 1 }, [false, true, false]],
    ['Volunteer', { hasVolunteerMembership: true }, [false, false, true]],
    [
      'leader and Volunteer',
      { ledMinistries: 2, hasVolunteerMembership: true },
      [false, true, true],
    ],
    [
      'admin and Volunteer',
      { isChurchAdmin: true, hasVolunteerMembership: true },
      [true, true, true],
    ],
  ])('mounts additive sections for %s', async (_name, input, [
    church,
    leadership,
    serving,
  ]) => {
    givenCapabilities(input);
    renderHomePage();

    await screen.findByRole('link', { name: /Notificações · 0 não lidas/ });
    expect(Boolean(churchSection())).toBe(church);
    expect(Boolean(leadershipSection())).toBe(leadership);
    expect(Boolean(servingSection())).toBe(serving);
    expect(screen.queryByText(/Nothing needs you/)).not.toBeInTheDocument();
  });

  it('puts volunteer actions ahead of the summary and attention list', async () => {
    givenCapabilities({ isChurchAdmin: true, hasVolunteerMembership: true });
    renderHomePage();
    await screen.findByRole('heading', { name: m.home_attention_schedules() });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings.indexOf(m.home_next_assignment())).toBeLessThan(
      headings.indexOf(m.home_summary()),
    );
    expect(headings.indexOf(m.home_summary())).toBeLessThan(
      headings.indexOf(m.home_attention_schedules()),
    );
  });

  it('links whole-scope counts to the matching list filters', async () => {
    givenCapabilities({ isChurchAdmin: true });
    renderHomePage();
    expect(
      await screen.findByRole('link', { name: /2 A preparar/ }),
    ).toHaveAttribute('href', '/schedules?stage=to_prepare');
    expect(screen.getByRole('link', { name: /3 Consultando/ })).toHaveAttribute(
      'href',
      '/schedules?stage=asking',
    );
    expect(
      screen.getByRole('link', { name: /3 Pessoas sem ministério/ }),
    ).toHaveAttribute('href', '/people?withoutMinistry=true');
    expect(
      screen.getByRole('link', { name: /4 Convites pendentes/ }),
    ).toHaveAttribute('href', '/invitations?status=pending');
    expect(
      screen.getByRole('link', { name: /2 Convites vencidos/ }),
    ).toHaveAttribute('href', '/invitations?status=expired');
    expect(
      screen.getByRole('link', { name: /3 Ministérios para revisar/ }),
    ).toHaveAttribute('href', '/ministries?status=review');
    expect(
      screen.getByRole('link', { name: /1 Ministérios sem setores/ }),
    ).toHaveAttribute('href', '/ministries?status=no-sectors');
  });

  it('collapses zero attention counts while retaining the People group', async () => {
    givenCapabilities({ isChurchAdmin: true });
    vi.mocked(peopleApi.listPeople).mockResolvedValueOnce({
      items: [],
      options: { ministries: [] },
      counts: {
        total: 12,
        admins: 1,
        leaders: 2,
        volunteers: 7,
        withoutMinistry: 0,
      },
    });
    vi.mocked(invitationsApi.listInvitations).mockResolvedValueOnce({
      items: [],
      options: { ministries: [], invitedAs: [] },
      counts: { pending: 0, expired: 0, accepted: 0, declined: 0, revoked: 0 },
    });
    vi.mocked(adminApi.listMinistryDirectory).mockResolvedValueOnce({
      ministries: [],
      counts: { total: 1, review: 0, noSectors: 0 },
    });
    renderHomePage();
    expect(await screen.findByText(m.home_all_clear())).toBeVisible();
    expect(
      screen.getByRole('heading', { name: m.home_people_group() }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Pessoas sem ministério/ }),
    ).not.toBeInTheDocument();
  });

  it('uses singular unread wording in the compact notification link', async () => {
    givenCapabilities({});
    vi.mocked(notificationsApi.getNotifications).mockResolvedValueOnce({
      items: [],
      unreadCount: 1,
    });
    renderHomePage();
    expect(
      await screen.findByRole('link', { name: 'Notificações · 1 não lida' }),
    ).toBeVisible();
  });

  it('drops a section’s cached reads when its capacity is lost, keeping held ones', async () => {
    givenCapabilities({ isChurchAdmin: true, hasVolunteerMembership: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const keyFor = (section: 'church' | 'serving') =>
      homeSectionQueryKey({
        section,
        churchId: DEFAULT_CHURCH_ID,
        userId: HOME_USER_ID,
      });
    queryClient.setQueryData(keyFor('church'), { secret: true });
    queryClient.setQueryData(keyFor('serving'), { mine: true });
    renderHomePage({ queryClient });
    await screen.findByRole('heading', { name: m.home_section_church() });
    expect(queryClient.getQueryData(keyFor('church'))).toBeDefined();

    givenCapabilities({ hasVolunteerMembership: true });
    await queryClient.invalidateQueries({ queryKey: ['caller-capabilities'] });

    await waitFor(() =>
      expect(queryClient.getQueryData(keyFor('church'))).toBeUndefined(),
    );
    expect(queryClient.getQueryData(keyFor('serving'))).toBeDefined();
  });

  it('shows access-denied, membership-removed and Church-only banners at the top', async () => {
    givenCapabilities({});
    renderHomePage({
      search: {
        accessDenied: true,
        removedFrom: 'Old Church',
        joinedChurch: 'St. Peter',
        invitedMinistry: 'Youth',
      },
    });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      m.switch_church_access_denied(),
      m.no_access_removed_from({ churchName: 'Old Church' }),
      m.home_church_only_warning({
        churchName: 'St. Peter',
        ministryName: 'Youth',
      }),
    ]);
  });

  it('announces joined and declined Ministry Invitations once', async () => {
    givenCapabilities({});
    renderHomePage({
      search: { joinedMinistry: 'Care', invitationDeclined: true },
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));
    expect(toastSuccess).toHaveBeenCalledWith(
      m.ministry_invitation_joined_toast({ ministryName: 'Care' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      m.ministry_invitation_declined_toast(),
    );
  });
});
