import { m } from '@church/i18n/messages';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import type { NotificationInboxItem } from '@/features/notifications/hooks/use-notification-inbox';
import { useNotificationInbox } from '@/features/notifications/hooks/use-notification-inbox';
import { renderNotification } from '@/features/notifications/lib/notification-render';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const mockNavigate = vi.fn();
const MINISTRY_ID = '22222222-2222-4222-8222-222222222222';
const INVITATION_ID = '33333333-3333-4333-8333-333333333333';

const invitationSource: GetNotifications200ItemsItem = {
  id: 'notification-1',
  kind: 'ministry_invitation',
  data: {
    ministryInvitationId: INVITATION_ID,
    ministryId: MINISTRY_ID,
    ministryName: 'Worship',
  },
  createdAt: '2026-07-01T08:00:00.000Z',
};

function invitationItem(): NotificationInboxItem {
  return {
    id: 'notification-1',
    title: 'Convite',
    body: 'Convite para Worship',
    type: 'Convite',
    createdAt: invitationSource.createdAt,
    createdAtLabel: '01/07/2026 08:00',
    isUnread: true,
    source: invitationSource,
  };
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    onClick,
  }: {
    children: ReactNode;
    to: string;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/features/notifications/hooks/use-notification-inbox', () => ({
  useNotificationInbox: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const mockedUseNotificationInbox = vi.mocked(useNotificationInbox);

function createInboxHookResult(
  overrides: Partial<ReturnType<typeof useNotificationInbox>> = {},
): ReturnType<typeof useNotificationInbox> {
  return {
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    items: [],
    loadMore: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    openNotification: vi.fn(),
    pages: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    selectedNotification: undefined,
    setSelectedNotificationId: vi.fn(),
    unreadCount: 0,
    ...overrides,
  } as unknown as ReturnType<typeof useNotificationInbox>;
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unread count badge', () => {
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({ unreadCount: 3 }),
    );

    renderWithProviders(<NotificationBell />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides the badge when there are no unread notifications', () => {
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({ unreadCount: 0 }),
    );

    renderWithProviders(<NotificationBell />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the dropdown showing recent items and closes on trigger toggle', async () => {
    const user = userEvent.setup();
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({
        unreadCount: 1,
        items: [invitationItem()],
      }),
    );

    renderWithProviders(<NotificationBell />);

    expect(screen.queryByText('Convite')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: m.notification_bell_label() }),
    );
    expect(screen.getByText('Convite')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: m.notification_bell_label() }),
    );
    expect(screen.queryByText('Convite')).not.toBeInTheDocument();
  });

  it('opens the detail sheet on selection without navigating', async () => {
    const user = userEvent.setup();
    const openNotification = vi.fn();
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({
        unreadCount: 1,
        openNotification,
        items: [invitationItem()],
      }),
    );

    renderWithProviders(<NotificationBell />);
    await user.click(
      screen.getByRole('button', { name: m.notification_bell_label() }),
    );
    await user.click(screen.getByText('Convite'));

    expect(openNotification).toHaveBeenCalledWith('notification-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to the destination only through Open in the detail sheet', async () => {
    const user = userEvent.setup();
    const setSelectedNotificationId = vi.fn();
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({
        items: [invitationItem()],
        selectedNotification: invitationItem(),
        setSelectedNotificationId,
      }),
    );

    renderWithProviders(<NotificationBell />);
    expect(mockNavigate).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: m.notification_open_context() }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/invitations/ministry/$invitationId',
      params: { invitationId: INVITATION_ID },
    });
    expect(setSelectedNotificationId).toHaveBeenCalledWith(undefined);
  });

  it('opens a Ministry invitation through its own See invitation action', async () => {
    const user = userEvent.setup();
    const item = {
      ...invitationItem(),
      actionLabel: m.notification_ministry_invitation_action(),
    };
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({ items: [item], selectedNotification: item }),
    );

    renderWithProviders(<NotificationBell />);
    expect(
      screen.queryByRole('button', { name: m.notification_open_context() }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', {
        name: m.notification_ministry_invitation_action(),
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/invitations/ministry/$invitationId',
      params: { invitationId: INVITATION_ID },
    });
  });

  it('shows N2 in the detail sheet and Prepare opens the Cycle-preserving picker for several Ministries', async () => {
    const user = userEvent.setup();
    const cycleId = '44444444-4444-4444-8444-444444444444';
    const kidsId = '55555555-5555-4555-8555-555555555555';
    const source: GetNotifications200ItemsItem = {
      id: 'notification-2',
      kind: 'cycle_ready_to_prepare',
      data: {
        cycleId,
        cycleName: 'Outubro',
        cycleStartDate: '2026-10-12',
        cycleEndDate: '2026-10-25',
        eventCount: 2,
        ministries: [
          { id: MINISTRY_ID, name: 'Worship' },
          { id: kidsId, name: 'Kids' },
        ],
      },
      createdAt: '2026-10-01T08:00:00.000Z',
    };
    const rendered = renderNotification(source);
    const item: NotificationInboxItem = {
      ...invitationItem(),
      id: source.id,
      title: rendered.title,
      body: rendered.body,
      type: rendered.kindLabel,
      actionLabel: rendered.actionLabel,
      source,
    };
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({ items: [item], selectedNotification: item }),
    );

    renderWithProviders(<NotificationBell />);
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent(
      m.notification_cycle_ready_to_prepare_title({ cycleName: 'Outubro' }),
    );
    expect(sheet).toHaveTextContent(
      m.notification_cycle_ready_to_prepare_ministries_other({
        ministryNames: 'Worship, Kids',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.notification_cycle_ready_to_prepare_action(),
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/schedules',
      search: { cycleId, ministryIds: `${MINISTRY_ID},${kidsId}` },
    });
  });

  it('falls back to the Notifications page with feedback for a kind this build cannot open', async () => {
    const user = userEvent.setup();
    const unknown = {
      ...invitationItem(),
      source: { ...invitationSource, kind: 'future_kind' },
    } as unknown as NotificationInboxItem;
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({
        items: [unknown],
        selectedNotification: unknown,
      }),
    );

    renderWithProviders(<NotificationBell />);
    await user.click(
      screen.getByRole('button', { name: m.notification_open_context() }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/notifications' });
    expect(toast.info).toHaveBeenCalledWith(m.notification_open_unavailable());
  });

  it('renders a "View all" link targeting /notifications', async () => {
    const user = userEvent.setup();
    mockedUseNotificationInbox.mockReturnValue(createInboxHookResult());

    renderWithProviders(<NotificationBell />);
    await user.click(
      screen.getByRole('button', { name: m.notification_bell_label() }),
    );

    expect(
      screen.getByRole('link', { name: m.notification_view_all() }),
    ).toHaveAttribute('href', '/notifications');
  });
});
