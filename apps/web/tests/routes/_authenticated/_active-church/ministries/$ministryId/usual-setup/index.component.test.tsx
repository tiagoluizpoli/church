import { m } from '@church/i18n/messages';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLAGGED_SERVICE,
  MINISTRY_ID,
  NIGHT,
  ROLES,
  SECTORS,
  SERVICE,
  setupOf,
  WELCOME,
  WORSHIP,
} from './usual-setup.fixtures';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listUsualSetup = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: async () => ({ ministries: [WORSHIP] }),
    getMinistry: async () => WORSHIP,
    listSectors: async () => ({ sectors: SECTORS }),
    listMinistryRoles: async () => ({ roles: ROLES }),
    listUsualSetup: (...args: unknown[]) => listUsualSetup(...args),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  listUsualSetup.mockResolvedValue(setupOf(WELCOME, SERVICE, NIGHT));
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ ledMinistries: 1 }),
  );
});

function renderList() {
  return renderRoute({
    initialPath: `/ministries/${MINISTRY_ID}/usual-setup`,
    churchTimezone: 'UTC',
  });
}

function rowsOf(templateName: string) {
  return within(screen.getByRole('list', { name: templateName }))
    .getAllByRole('link')
    .map((row) => row.textContent);
}

describe('/ministries/$ministryId/usual-setup', () => {
  it('marks a block whose manual split needs review and explains the whole-block fallback', async () => {
    listUsualSetup.mockResolvedValue(setupOf(WELCOME, FLAGGED_SERVICE));

    renderList();

    const row = (await screen.findByRole('link', { name: /Service/ }))
      .textContent;
    expect(row).toContain(m.usual_setup_needs_review());
    expect(row).toContain(m.usual_setup_review_fallback());
    expect(screen.getAllByText(m.usual_setup_needs_review())).toHaveLength(1);
  });

  it('groups blocks by template with weekday, time and a served or Not served summary', async () => {
    renderList();

    expect(await screen.findByRole('list', { name: 'Sunday' })).toBeVisible();
    expect(listUsualSetup).toHaveBeenCalledWith(MINISTRY_ID);
    expect(rowsOf('Sunday')).toEqual([
      `Welcome09:00–10:00${m.usual_setup_not_served()}`,
      `Service10:00–12:00${m.usual_setup_shift_count_one()} · ${m.usual_setup_people_count_other({ count: 3 })}`,
    ]);
    expect(rowsOf('Vigil')).toEqual([
      `Night22:00–02:00 (${m.usual_setup_next_day()})${m.usual_setup_not_served()}`,
    ]);
  });

  it('counts people across every Shift, singular when one', async () => {
    listUsualSetup.mockResolvedValue(
      setupOf({
        ...SERVICE,
        entry: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [
            {
              shiftIndex: 1,
              sectorId: 'sector-stage',
              roleId: 'role-singer',
              peopleNeeded: 1,
            },
          ],
        },
      }),
    );

    renderList();

    expect(
      await screen.findByText(
        `${m.usual_setup_shift_count_other({ count: 2 })} · ${m.usual_setup_people_count_one()}`,
      ),
    ).toBeVisible();
  });

  it('opens a block on its own nested page', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('link', { name: /Welcome/ }));

    expect(
      await screen.findByRole('heading', { name: 'Sunday · Welcome' }),
    ).toBeVisible();
  });

  it('shows a retryable error instead of an empty list when loading fails', async () => {
    const user = userEvent.setup();
    listUsualSetup.mockRejectedValueOnce(new Error('offline'));
    renderList();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(m.usual_setup_load_failed())).toBeVisible();
    expect(screen.queryByText(m.usual_setup_not_served())).toBeNull();
    await user.click(
      within(alert).getByRole('button', { name: m.usual_setup_retry() }),
    );

    expect(await screen.findByRole('list', { name: 'Sunday' })).toBeVisible();
  });

  it('links a ChurchAdmin to Event templates when there are none', async () => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ isChurchAdmin: true }),
    );
    listUsualSetup.mockResolvedValue(setupOf());

    renderList();

    expect(await screen.findByText(m.usual_setup_no_templates())).toBeVisible();
    expect(
      screen.getByRole('link', { name: m.usual_setup_open_event_templates() }),
    ).toHaveAttribute('href', '/event-templates');
  });

  it('explains the missing templates to a leader without a management shortcut', async () => {
    listUsualSetup.mockResolvedValue(setupOf());

    renderList();

    expect(
      await screen.findByText(m.usual_setup_no_templates_leader()),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', {
        name: m.usual_setup_open_event_templates(),
      }),
    ).toBeNull();
  });
});
