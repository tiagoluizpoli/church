import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MINISTRY_ID,
  ROLES,
  SECTORS,
  WORSHIP,
} from './usual-setup/usual-setup.fixtures';
import type {
  GetEventGroups200,
  SaveEventGroupsBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const getEventGroups = vi.fn();
const saveEventGroups = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: async () => ({ ministries: [WORSHIP] }),
    getMinistry: async () => WORSHIP,
    listSectors: async () => ({ sectors: SECTORS }),
    listMinistryRoles: async () => ({ roles: ROLES }),
    getEventGroups: (...args: unknown[]) => getEventGroups(...args),
    saveEventGroups: (...args: unknown[]) => saveEventGroups(...args),
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

const SUNDAY = { id: 'template-sunday', name: 'Culto de Domingo' };
const WEDNESDAY = { id: 'template-wednesday', name: 'Culto de Quarta' };
const SUPPER = { id: 'template-supper', name: 'Santa Ceia' };
const TEMPLATES = [SUNDAY, WEDNESDAY, SUPPER];

const GROUPED: GetEventGroups200 = {
  groups: [
    { name: 'Domingos', templates: [SUNDAY, SUPPER] },
    { name: 'Quartas', templates: [WEDNESDAY] },
  ],
  catchAllName: null,
  templates: TEMPLATES,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ ledMinistries: 1 }),
  );
  getEventGroups.mockResolvedValue(GROUPED);
  saveEventGroups.mockImplementation(
    async (_ministryId: string, body: SaveEventGroupsBody) => ({
      groups: body.groups.map((group) => ({
        name: group.name,
        templates: TEMPLATES.filter((template) =>
          group.templateIds.includes(template.id),
        ),
      })),
      catchAllName: body.catchAllName,
      templates: TEMPLATES,
    }),
  );
});

function renderTab(search = '') {
  return renderRoute({
    initialPath: `/app/ministries/${MINISTRY_ID}/event-groups${search}`,
    churchTimezone: 'UTC',
  });
}

/** Each group card's heading, in page order; the catch-all comes last. */
async function groupNames() {
  const groups = await screen.findAllByRole('group', { name: /./ });
  return groups.map((group) => group.getAttribute('aria-label'));
}

function groupCard(name: string) {
  return screen.getByRole('group', { name });
}

async function save() {
  await userEvent.click(
    screen.getByRole('button', { name: m.event_groups_save() }),
  );
}

describe('/app/ministries/$ministryId/event-groups', () => {
  it('is a tab of the Ministry page', async () => {
    renderTab();
    const tab = await screen.findByRole('link', {
      name: m.ministry_tab_event_groups(),
    });
    expect(tab).toHaveAttribute('data-status', 'active');
  });

  it('shows the groups in order with the catch-all fixed last, renamable and not deletable', async () => {
    renderTab();

    expect(await groupNames()).toEqual([
      'Domingos',
      'Quartas',
      m.event_groups_catch_all_title(),
    ]);
    const catchAll = groupCard(m.event_groups_catch_all_title());
    expect(
      within(catchAll).getByRole('textbox', {
        name: m.event_groups_catch_all_name_label(),
      }),
    ).toHaveAttribute('placeholder', m.export_catch_all_default());
    expect(within(catchAll).queryByRole('button')).toBeNull();
    expect(
      within(groupCard('Domingos'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Culto de Domingo', 'Santa Ceia']);
  });

  it('starts on one plain list when the Ministry has no groups', async () => {
    getEventGroups.mockResolvedValue({
      groups: [],
      catchAllName: null,
      templates: TEMPLATES,
    });
    renderTab();

    expect(
      await screen.findByRole('radio', { name: m.event_groups_mode_single() }),
    ).toBeChecked();
    expect(screen.queryByRole('group', { name: /./ })).toBeNull();

    await userEvent.click(
      screen.getByRole('radio', { name: m.event_groups_mode_split() }),
    );
    await userEvent.clear(
      screen.getByRole('textbox', { name: m.event_groups_group_name_label() }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: m.event_groups_group_name_label() }),
      'Domingos',
    );
    await userEvent.click(
      within(groupCard('Domingos')).getByRole('combobox', {
        name: m.event_groups_add_template(),
      }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: SUNDAY.name }),
    );
    await save();

    await waitFor(() =>
      expect(saveEventGroups).toHaveBeenCalledExactlyOnceWith(MINISTRY_ID, {
        groups: [{ name: 'Domingos', templateIds: [SUNDAY.id] }],
        catchAllName: null,
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(m.event_groups_saved());
  });

  it('moves a template out of its old group when added to another', async () => {
    renderTab();
    await groupNames();

    await userEvent.click(
      within(groupCard('Quartas')).getByRole('combobox', {
        name: m.event_groups_add_template(),
      }),
    );
    await userEvent.click(
      await screen.findByRole('option', {
        name: m.event_groups_template_moves({
          template: SUPPER.name,
          group: 'Domingos',
        }),
      }),
    );

    expect(
      within(groupCard('Domingos'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Culto de Domingo']);
    expect(
      within(groupCard('Quartas'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Culto de Quarta', 'Santa Ceia']);
    await save();
    await waitFor(() =>
      expect(saveEventGroups).toHaveBeenCalledExactlyOnceWith(MINISTRY_ID, {
        groups: [
          { name: 'Domingos', templateIds: [SUNDAY.id] },
          { name: 'Quartas', templateIds: [WEDNESDAY.id, SUPPER.id] },
        ],
        catchAllName: null,
      }),
    );
  });

  it('renames, reorders, removes templates and deletes groups, keeping the catch-all last', async () => {
    renderTab();
    await groupNames();

    await userEvent.click(
      screen.getByRole('button', {
        name: m.event_groups_move_up({ group: 'Quartas' }),
      }),
    );
    expect(await groupNames()).toEqual([
      'Quartas',
      'Domingos',
      m.event_groups_catch_all_title(),
    ]);
    await userEvent.click(
      screen.getByRole('button', {
        name: m.event_groups_remove_template({
          template: SUPPER.name,
          group: 'Domingos',
        }),
      }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.event_groups_delete_group({ group: 'Quartas' }),
      }),
    );
    await userEvent.type(
      screen.getByRole('textbox', {
        name: m.event_groups_catch_all_name_label(),
      }),
      'Especiais',
    );
    expect(await groupNames()).toEqual([
      'Domingos',
      m.event_groups_catch_all_title(),
    ]);
    await save();

    await waitFor(() =>
      expect(saveEventGroups).toHaveBeenCalledExactlyOnceWith(MINISTRY_ID, {
        groups: [{ name: 'Domingos', templateIds: [SUNDAY.id] }],
        catchAllName: 'Especiais',
      }),
    );
  });

  it('saves an empty list for one plain list', async () => {
    renderTab();
    await groupNames();

    await userEvent.click(
      screen.getByRole('radio', { name: m.event_groups_mode_single() }),
    );
    expect(screen.queryByRole('group', { name: /./ })).toBeNull();
    await save();

    await waitFor(() =>
      expect(saveEventGroups).toHaveBeenCalledExactlyOnceWith(MINISTRY_ID, {
        groups: [],
        catchAllName: null,
      }),
    );
  });

  it('asks for a name before saving a nameless group', async () => {
    renderTab();
    await groupNames();

    await userEvent.clear(
      within(groupCard('Quartas')).getByRole('textbox', {
        name: m.event_groups_group_name_label(),
      }),
    );
    await save();

    expect(
      await screen.findByText(m.event_groups_name_required()),
    ).toBeVisible();
    expect(saveEventGroups).not.toHaveBeenCalled();
  });

  it('links back to the Schedule it came from, reopening the export', async () => {
    const { router } = renderTab('?cycleId=cycle-1');

    const back = await screen.findByRole('link', {
      name: m.event_groups_back_to_schedule(),
    });
    expect(back).toHaveAttribute(
      'href',
      `/app/schedules/${MINISTRY_ID}/cycle-1?export=true`,
    );
    expect(router.state.location.pathname).toContain('event-groups');
  });

  it('has no back link when opened from the Ministry page', async () => {
    renderTab();
    await groupNames();
    expect(
      screen.queryByRole('link', { name: m.event_groups_back_to_schedule() }),
    ).toBeNull();
  });
});
