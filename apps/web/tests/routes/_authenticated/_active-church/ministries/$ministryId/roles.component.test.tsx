import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listMinistries = vi.fn();
const getMinistry = vi.fn();
const listMinistryRoles = vi.fn();
const createMinistryRole = vi.fn();
const renameMinistryRole = vi.fn();
const archiveMinistryRole = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    getMinistry: (...args: unknown[]) => getMinistry(...args),
    listMinistryRoles: (...args: unknown[]) => listMinistryRoles(...args),
    createMinistryRole: (...args: unknown[]) => createMinistryRole(...args),
    renameMinistryRole: (...args: unknown[]) => renameMinistryRole(...args),
    archiveMinistryRole: (...args: unknown[]) => archiveMinistryRole(...args),
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

const MINISTRY_ID = '33333333-3333-4333-8333-333333333331';
const SINGER_ID = '55555555-5555-4555-8555-555555555551';
const CYCLE_ID = '66666666-6666-4666-8666-666666666661';

const ministry = {
  id: MINISTRY_ID,
  churchId: 'church-1',
  name: 'Worship',
  defaultDirection: 'all_out',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

const asAdmin = () =>
  signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
const asLeader = () =>
  signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));

beforeEach(() => {
  vi.clearAllMocks();
  getMinistry.mockResolvedValue(ministry);
  listMinistries.mockResolvedValue({ ministries: [ministry] });
  listMinistryRoles.mockResolvedValue({
    roles: [
      { id: '55555555-5555-4555-8555-555555555552', name: 'drums' },
      { id: SINGER_ID, name: 'Singer' },
    ],
  });
});

function renderRoles() {
  return renderRoute({
    initialPath: `/ministries/${MINISTRY_ID}/roles`,
    churchTimezone: 'UTC',
  });
}

async function roleRows() {
  const list = await screen.findByRole('list', {
    name: m.ministry_roles_list_label(),
  });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByTestId('role-name').textContent);
}

describe('/ministries/$ministryId/roles', () => {
  it('lists the active Roles in the order the server sorts them', async () => {
    asLeader();

    renderRoles();

    expect(await roleRows()).toEqual(['drums', 'Singer']);
    expect(listMinistryRoles).toHaveBeenCalledWith(MINISTRY_ID);
  });

  it('shows the empty state when the Ministry has no Roles', async () => {
    asAdmin();
    listMinistryRoles.mockResolvedValue({ roles: [] });

    renderRoles();

    expect(await screen.findByText(m.ministry_roles_empty())).toBeVisible();
  });

  it('adds a name-only Role and refreshes the list', async () => {
    asLeader();
    createMinistryRole.mockResolvedValue({ id: 'new', name: 'Keys' });
    const user = userEvent.setup();
    renderRoles();
    await roleRows();

    await user.click(
      screen.getByRole('button', { name: m.ministry_roles_add() }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(m.ministries_name_label()),
      '  Keys ',
    );
    listMinistryRoles.mockResolvedValue({
      roles: [{ id: 'new', name: 'Keys' }],
    });
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_roles_add_submit(),
      }),
    );

    expect(createMinistryRole).toHaveBeenCalledWith(MINISTRY_ID, {
      name: 'Keys',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect(await roleRows()).toEqual(['Keys']));
  });

  it('keeps the typed name with an inline conflict when the name is in use', async () => {
    asAdmin();
    createMinistryRole.mockRejectedValue(
      refusal(409, { error: 'ROLE_NAME_IN_USE', message: 'x' }),
    );
    const user = userEvent.setup();
    renderRoles();
    await roleRows();

    await user.click(
      screen.getByRole('button', { name: m.ministry_roles_add() }),
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    await user.type(input, 'SINGER');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_roles_add_submit(),
      }),
    );

    expect(
      await within(dialog).findByText(m.error_role_name_in_use()),
    ).toBeVisible();
    expect(input).toHaveValue('SINGER');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('renames a Role in place without a history warning', async () => {
    asLeader();
    renameMinistryRole.mockResolvedValue({ id: SINGER_ID, name: 'Vocals' });
    const user = userEvent.setup();
    renderRoles();
    await roleRows();

    await user.click(
      screen.getByRole('button', {
        name: m.ministry_roles_rename_named({ name: 'Singer' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    expect(input).toHaveValue('Singer');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.clear(input);
    await user.type(input, 'Vocals');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_roles_rename_submit(),
      }),
    );

    expect(renameMinistryRole).toHaveBeenCalledWith(MINISTRY_ID, SINGER_ID, {
      name: 'Vocals',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('archives after confirmation and refreshes the list', async () => {
    asAdmin();
    archiveMinistryRole.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderRoles();
    await roleRows();

    await user.click(
      screen.getByRole('button', {
        name: m.ministry_roles_archive_named({ name: 'Singer' }),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(m.ministry_roles_archive_description()),
    ).toBeVisible();
    listMinistryRoles.mockResolvedValue({
      roles: [{ id: '55555555-5555-4555-8555-555555555552', name: 'drums' }],
    });
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_roles_archive_confirm(),
      }),
    );

    expect(archiveMinistryRole).toHaveBeenCalledWith(MINISTRY_ID, SINGER_ID);
    await waitFor(async () => expect(await roleRows()).toEqual(['drums']));
  });

  it('lists blocking locations with new-tab links when archive is refused', async () => {
    asLeader();
    archiveMinistryRole.mockRejectedValue(
      refusal(409, {
        error: 'ROLE_IN_USE',
        message: 'x',
        blockers: [
          {
            kind: 'requirement',
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
            cycleId: CYCLE_ID,
            cycleName: 'November',
            eventId: 'e1',
            eventTimeBlockId: 'b1',
          },
          {
            kind: 'usual_setup',
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
            templateTimeBlockId: 't1',
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderRoles();
    await roleRows();

    await user.click(
      screen.getByRole('button', {
        name: m.ministry_roles_archive_named({ name: 'Singer' }),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_roles_archive_confirm(),
      }),
    );

    expect(
      await within(dialog).findByText(m.ministry_roles_archive_blocked()),
    ).toBeVisible();
    const link = within(dialog).getByRole('link', {
      name: new RegExp(
        m.ministry_blocker_requirement({
          cycleName: 'November',
          ministryName: 'Worship',
        }),
      ),
    });
    expect(link).toHaveAttribute(
      'href',
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    const usualSetup = within(dialog).getByRole('link', {
      name: new RegExp(
        m.ministry_blocker_usual_setup({ ministryName: 'Worship' }),
      ),
    });
    expect(usualSetup).toHaveAttribute(
      'href',
      `/ministries/${MINISTRY_ID}/usual-setup`,
    );
    expect(usualSetup).toHaveAttribute('target', '_blank');
    // The Role stays listed behind the still-open dialog.
    expect(
      screen.getAllByTestId('role-name').map((row) => row.textContent),
    ).toEqual(['drums', 'Singer']);
  });
});
