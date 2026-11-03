import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetPerson200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const getPerson = vi.fn();
const changeChurchAccess = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: vi.fn(),
    changeChurchAccess: (...args: unknown[]) => changeChurchAccess(...args),
  },
  adminApi: { listMinistries: vi.fn().mockResolvedValue({ ministries: [] }) },
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

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

type ChurchAccess = NonNullable<GetPerson200['churchAccess']>;

function detail(churchAccess: Partial<ChurchAccess> = {}): GetPerson200 {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    canChangeChurchAccess: true,
    canInviteToMinistry: false,
    churchAccess: {
      accessLevel: 'member',
      isLastAdmin: false,
      isSelf: false,
      ...churchAccess,
    },
    ministries: [],
  };
}

/** What a Ministry leader sees of the same member: no Church access at all. */
function leaderView(): GetPerson200 {
  const { churchAccess: _hidden, ...rest } = detail();
  return { ...rest, canChangeChurchAccess: false };
}

function refusal(status: number, error: string) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data: { error, message: error },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

const open = () =>
  renderRoute({ initialPath: '/people/mem-1', churchTimezone: 'UTC' });

const accessSection = async () =>
  (
    await screen.findByRole('heading', { name: m.people_church_access() })
  ).closest('section') as HTMLElement;

describe('Church access control', () => {
  it('makes a member an admin only after confirmation, naming the person', async () => {
    const user = userEvent.setup();
    let promoted = false;
    getPerson.mockImplementation(async () =>
      detail({ accessLevel: promoted ? 'admin' : 'member' }),
    );
    changeChurchAccess.mockImplementation(async () => {
      promoted = true;
      return { memberId: 'mem-1', accessLevel: 'admin', changed: true };
    });
    open();

    await user.click(
      within(await accessSection()).getByRole('button', {
        name: m.people_make_admin(),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        m.people_make_admin_title({ name: 'Ana Souza' }),
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: m.people_access_cancel() }),
    );
    expect(changeChurchAccess).not.toHaveBeenCalled();

    await user.click(
      await within(await accessSection()).findByRole('button', {
        name: m.people_make_admin(),
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.people_make_admin(),
      }),
    );

    await waitFor(() =>
      expect(changeChurchAccess).toHaveBeenCalledWith('mem-1', {
        accessLevel: 'admin',
      }),
    );
    expect(changeChurchAccess).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        m.people_made_admin_toast({ name: 'Ana Souza' }),
      ),
    );
    expect(
      await within(await accessSection()).findByText(
        m.people_church_access_admin(),
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('sends one request while the change is pending', async () => {
    const user = userEvent.setup();
    getPerson.mockResolvedValue(detail({ accessLevel: 'admin' }));
    changeChurchAccess.mockReturnValue(new Promise(() => {}));
    open();

    await user.click(
      within(await accessSection()).getByRole('button', {
        name: m.people_remove_admin(),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        m.people_remove_admin_description({ name: 'Ana Souza' }),
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: m.people_remove_admin() }),
    );

    const pending = await within(dialog).findByRole('button', {
      name: m.people_access_saving(),
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(changeChurchAccess).toHaveBeenCalledTimes(1);
  });

  it('explains a last-admin refusal and refreshes the authoritative access', async () => {
    const user = userEvent.setup();
    getPerson.mockResolvedValue(
      detail({ accessLevel: 'admin', isLastAdmin: true }),
    );
    changeChurchAccess.mockRejectedValue(refusal(409, 'LAST_CHURCH_ADMIN'));
    open();

    const section = await accessSection();
    await waitFor(() => expect(getPerson).toHaveBeenCalled());
    const readsBefore = getPerson.mock.calls.length;
    expect(within(section).getByText(m.people_last_admin_note())).toBeVisible();
    await user.click(
      within(section).getByRole('button', { name: m.people_remove_admin() }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.people_remove_admin(),
      }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(m.error_last_church_admin()),
    );
    await waitFor(() =>
      expect(getPerson.mock.calls.length).toBeGreaterThan(readsBefore),
    );
    expect(
      within(await accessSection()).getByText(m.people_church_access_admin()),
    ).toBeVisible();
  });

  it('shows a retryable failure for an unexpected error', async () => {
    const user = userEvent.setup();
    getPerson.mockResolvedValue(detail());
    changeChurchAccess.mockRejectedValue(new Error('network'));
    open();

    await user.click(
      within(await accessSection()).getByRole('button', {
        name: m.people_make_admin(),
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.people_make_admin(),
      }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(m.people_access_failed()),
    );
    expect(
      within(await accessSection()).getByRole('button', {
        name: m.people_make_admin(),
      }),
    ).toBeEnabled();
  });

  it('warns before self-demotion and stays on detail when leader scope still shows the member', async () => {
    const user = userEvent.setup();
    let demoted = false;
    getPerson.mockImplementation(async () =>
      demoted ? leaderView() : detail({ accessLevel: 'admin', isSelf: true }),
    );
    changeChurchAccess.mockImplementation(async () => {
      demoted = true;
      return { memberId: 'mem-1', accessLevel: 'member', changed: true };
    });
    const { router } = open();

    await user.click(
      within(await accessSection()).getByRole('button', {
        name: m.people_remove_admin(),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(m.people_remove_own_admin_title()),
    ).toBeVisible();
    expect(
      within(dialog).getByText(m.people_remove_own_admin_description()),
    ).toBeVisible();
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ ledMinistries: 1 }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: m.people_remove_admin() }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: m.people_church_access() }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Ana Souza', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/people/mem-1');
    expect(getCallerCapabilities.mock.calls.length).toBeGreaterThan(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      m.people_removed_own_admin_toast(),
    );
  });

  it('goes Home after self-demotion when no remaining scope shows the member', async () => {
    const user = userEvent.setup();
    let demoted = false;
    getPerson.mockImplementation(async () => {
      if (demoted) throw refusal(403, 'FORBIDDEN');
      return detail({ accessLevel: 'admin', isSelf: true });
    });
    changeChurchAccess.mockImplementation(async () => {
      demoted = true;
      return { memberId: 'mem-1', accessLevel: 'member', changed: true };
    });
    const { router } = open();

    await user.click(
      within(await accessSection()).getByRole('button', {
        name: m.people_remove_admin(),
      }),
    );
    getCallerCapabilities.mockResolvedValue(callerCapabilitiesFixture());
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.people_remove_admin(),
      }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/(dashboard)?$/),
    );
    expect(
      screen.queryByRole('heading', { name: m.people_church_access() }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  });

  it('reads in English', async () => {
    overwriteGetLocale(() => 'en');
    const user = userEvent.setup();
    getPerson.mockResolvedValue(detail({ accessLevel: 'admin', isSelf: true }));
    open();

    await user.click(
      await screen.findByRole('button', { name: 'Remove admin' }),
    );
    expect(
      await screen.findByText('Remove your own admin access?'),
    ).toBeVisible();
  });
});
