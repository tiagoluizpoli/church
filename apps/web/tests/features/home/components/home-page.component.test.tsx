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

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
  volunteerApi: {
    listAvailabilityChecks: vi.fn().mockResolvedValue({ checks: [] }),
    getPublishedVolunteerSchedule: vi
      .fn()
      .mockResolvedValue({ assignments: [], schedules: [] }),
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, info: vi.fn(), warning: vi.fn() },
}));

const churchSection = () =>
  screen.queryByRole('heading', { name: m.home_section_church() });
const leadershipSection = () =>
  screen.queryByRole('heading', { name: m.home_section_leadership() });
const servingSection = () =>
  screen.queryByRole('heading', { name: m.home_section_serving() });

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
    expect(screen.queryByText(/St\. Peter/)).not.toBeInTheDocument();
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
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    expect(Boolean(churchSection())).toBe(church);
    expect(Boolean(leadershipSection())).toBe(leadership);
    expect(Boolean(servingSection())).toBe(serving);
    expect(screen.queryByText(/Nothing needs you/)).not.toBeInTheDocument();
  });

  it('orders sections Church, Ministries I lead, My serving', async () => {
    givenCapabilities({ isChurchAdmin: true, hasVolunteerMembership: true });
    renderHomePage();

    await screen.findByRole('heading', { name: m.home_section_serving() });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      m.home_section_church(),
      m.home_section_leadership(),
      m.home_section_serving(),
    ]);
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
