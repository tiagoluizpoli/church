import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/setup/render';
import { NotificationBell } from './notification-bell';
import { useNotificationInbox } from '@/features/volunteers/hooks/use-notification-inbox';

const mockNavigate = vi.fn();

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

vi.mock('@/features/volunteers/hooks/use-notification-inbox', () => ({
  useNotificationInbox: vi.fn(),
}));

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
        items: [
          {
            id: 'notification-1',
            title: 'Assignment updated',
            body: 'Your assignment changed.',
            type: 'assignment changed',
            createdAt: '2026-07-01T08:00:00.000Z',
            createdAtLabel: '7/1/2026, 8:00:00 AM',
            isUnread: true,
            deepLink: { section: 'assignments', assignmentId: 'assignment-1' },
          },
        ],
      }),
    );

    renderWithProviders(<NotificationBell />);

    expect(screen.queryByText('Assignment updated')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('Assignment updated')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.queryByText('Assignment updated')).not.toBeInTheDocument();
  });

  it('navigates to the notification deep-link target and marks it read on item click', async () => {
    const user = userEvent.setup();
    const markRead = vi.fn();
    mockedUseNotificationInbox.mockReturnValue(
      createInboxHookResult({
        unreadCount: 1,
        markRead,
        items: [
          {
            id: 'notification-1',
            title: 'Assignment updated',
            body: 'Your assignment changed.',
            type: 'assignment changed',
            createdAt: '2026-07-01T08:00:00.000Z',
            createdAtLabel: '7/1/2026, 8:00:00 AM',
            isUnread: true,
            deepLink: { section: 'assignments', assignmentId: 'assignment-1' },
          },
        ],
      }),
    );

    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Assignment updated'));

    expect(markRead).toHaveBeenCalledWith('notification-1');
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/dashboard',
        search: expect.objectContaining({
          section: 'assignments',
          assignmentId: 'assignment-1',
        }),
      }),
    );
  });

  it('renders a "View all" link targeting /notifications', async () => {
    const user = userEvent.setup();
    mockedUseNotificationInbox.mockReturnValue(createInboxHookResult());

    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });
});
