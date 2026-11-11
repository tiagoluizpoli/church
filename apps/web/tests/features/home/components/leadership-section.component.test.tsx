import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';
import { renderHomePage } from '@/tests/features/home/components/render-home-page';
import {
  activeChurchApiMock,
  DEFAULT_CHURCH_ID,
} from '@/tests/setup/active-church';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params: Record<string, string>;
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key])}
      {...props}
    >
      {children}
    </a>
  ),
}));

const adminApiMock = vi.hoisted(() => ({ listSchedules: vi.fn() }));
vi.mock('@/utils/api-instances', async () => ({
  adminApi: adminApiMock,
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
}));

function schedule(
  input: Partial<ListSchedules200SchedulesItem> & { name: string },
): ListSchedules200SchedulesItem {
  const { name, ...rest } = input;
  return {
    ministry: { id: `m-${name}`, name },
    cycle: {
      id: `c-${name}`,
      name: 'October',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      state: 'sent',
    },
    stage: 'to_prepare',
    lateMarkCount: 0,
    openSwapRequestCount: 0,
    gapCount: 0,
    affectedVolunteerCount: 0,
    ...rest,
  };
}

function givenSchedules(schedules: ListSchedules200SchedulesItem[]) {
  adminApiMock.listSchedules.mockResolvedValue({ schedules });
}

function givenCapabilities(
  input: Parameters<typeof callerCapabilitiesFixture>[0],
) {
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture(input),
  );
}

describe('LeadershipSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [{ churchId: DEFAULT_CHURCH_ID, name: 'St. Peter', areas: [] }],
    });
    givenCapabilities({ ledMinistries: 1 });
  });

  it('renders stage, outstanding count and next-step link per row, for a leader', async () => {
    givenSchedules([
      schedule({ name: 'Prep' }),
      schedule({
        name: 'Ask',
        stage: 'asking',
        asking: { asked: 5, confirmed: 2 },
      }),
      schedule({ name: 'Assign', stage: 'assigning', gapCount: 4 }),
      schedule({ name: 'Pub', stage: 'published', openSwapRequestCount: 2 }),
    ]);
    renderHomePage();

    expect(await screen.findByText(m.schedules_to_prepare())).toBeVisible();
    expect(
      screen.getByText(m.schedules_asking_outstanding({ count: 3 })),
    ).toBeVisible();
    expect(
      screen.getByText(m.schedules_assigning_gaps({ count: 4 })),
    ).toBeVisible();
    expect(
      screen.getByText(
        `${m.schedules_published()} · ${m.schedules_swap_requests_other({ count: 2 })}`,
      ),
    ).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/schedules/m-Prep/c-Prep',
    );
  });

  it('shows every Ministry for a ChurchAdmin without a leader scope', async () => {
    givenCapabilities({ isChurchAdmin: true });
    givenSchedules([schedule({ name: 'Alpha' }), schedule({ name: 'Beta' })]);
    renderHomePage();

    expect(await screen.findByText(/Alpha · October/)).toBeVisible();
    expect(screen.getByText(/Beta · October/)).toBeVisible();
  });

  it('hides published without open requests, Past and not-serving rows and shows the empty state', async () => {
    givenSchedules([
      schedule({ name: 'Done', stage: 'published' }),
      schedule({ name: 'Away', stage: 'not_serving', gapCount: 3 }),
      schedule({
        name: 'Old',
        gapCount: 3,
        openSwapRequestCount: 1,
        cycle: {
          id: 'c-old',
          name: 'September',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          state: 'past',
        },
      }),
    ]);
    renderHomePage();

    expect(await screen.findByText(m.home_leadership_empty())).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps Asking and Assigning rows with a zero outstanding count', async () => {
    givenSchedules([
      schedule({
        name: 'Answered',
        stage: 'asking',
        asking: { asked: 2, confirmed: 2 },
      }),
      schedule({ name: 'Full', stage: 'assigning', gapCount: 0 }),
    ]);
    renderHomePage();

    expect(
      await screen.findByText(m.schedules_asking_outstanding({ count: 0 })),
    ).toBeVisible();
    expect(
      screen.getByText(m.schedules_assigning_gaps({ count: 0 })),
    ).toBeVisible();
  });

  it('shows an open Swap request count on a non-published row', async () => {
    givenSchedules([
      schedule({ name: 'Full', stage: 'assigning', openSwapRequestCount: 2 }),
    ]);
    renderHomePage();

    expect(
      await screen.findByText(
        `${m.schedules_assigning_gaps({ count: 0 })} · ${m.schedules_swap_requests_other({ count: 2 })}`,
      ),
    ).toBeVisible();
  });

  it('does not render the former all-Ministry rows after an admin becomes a leader', async () => {
    givenCapabilities({ isChurchAdmin: true });
    givenSchedules([schedule({ name: 'Alpha' }), schedule({ name: 'Beta' })]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderHomePage({ queryClient });
    expect(await screen.findByText(/Beta · October/)).toBeVisible();

    givenCapabilities({ ledMinistries: 1 });
    givenSchedules([schedule({ name: 'Alpha' })]);
    await queryClient.invalidateQueries({ queryKey: ['caller-capabilities'] });

    await waitFor(() =>
      expect(screen.queryByText(/Beta · October/)).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/Alpha · October/)).toBeVisible();
    const cached = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['home', 'leadership'] });
    expect(cached).toHaveLength(1);
  });

  it('distinguishes loading and error from empty, and retries', async () => {
    adminApiMock.listSchedules
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new Error('down'));
    const first = renderHomePage();
    expect(await screen.findByText(m.schedules_loading())).toBeInTheDocument();
    expect(screen.queryByText(m.home_leadership_empty())).toBeNull();
    first.unmount();

    renderHomePage();
    expect(await screen.findByText(m.schedules_error())).toBeVisible();
    expect(screen.queryByText(m.home_leadership_empty())).toBeNull();

    givenSchedules([]);
    await userEvent.click(
      screen.getByRole('button', { name: m.schedules_retry() }),
    );
    expect(await screen.findByText(m.home_leadership_empty())).toBeVisible();
  });

  it('is absent for a plain Volunteer', async () => {
    givenCapabilities({ hasVolunteerMembership: true });
    givenSchedules([schedule({ name: 'Prep' })]);
    renderHomePage();

    await screen.findByRole('heading', { name: m.home_section_serving() });
    expect(
      screen.queryByRole('heading', { name: m.home_section_leadership() }),
    ).not.toBeInTheDocument();
    expect(adminApiMock.listSchedules).not.toHaveBeenCalled();
  });
});
