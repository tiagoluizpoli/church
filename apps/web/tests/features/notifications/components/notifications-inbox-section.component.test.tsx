import { m } from '@church/i18n/messages';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type NotificationItemViewModel,
  type NotificationPageViewModel,
  NotificationsInboxSection,
} from '@/features/notifications/components/notifications-inbox-section';
import { renderWithProviders } from '@/tests/setup/render';

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
}));

const notificationPagesFixture: NotificationPageViewModel[] = [
  {
    dateBucketLabel: 'July 1, 2026',
    items: [
      {
        id: 'notification-1',
        title: 'Assignment updated',
        body: 'Your assignment changed from pending to confirmed.',
        type: 'assignment changed',
        createdAtLabel: '7/1/2026, 8:00:00 AM',
        isUnread: true,
      },
      {
        id: 'notification-2',
        title: 'Availability reminder',
        body: 'Please share your availability.',
        type: 'availability reminder',
        createdAtLabel: '7/1/2026, 7:00:00 AM',
        isUnread: false,
      },
    ],
  },
];

const recentItemsFixture: NotificationItemViewModel[] = [
  {
    id: 'notification-1',
    title: 'Assignment updated',
    body: 'Your assignment changed from pending to confirmed.',
    type: 'assignment changed',
    createdAtLabel: '7/1/2026, 8:00:00 AM',
    isUnread: true,
  },
  {
    id: 'notification-2',
    title: 'Availability reminder',
    body: 'Please share your availability.',
    type: 'availability reminder',
    createdAtLabel: '7/1/2026, 7:00:00 AM',
    isUnread: false,
  },
];

describe('NotificationsInboxSection (full mode — /notifications page)', () => {
  it('renders unread state and notification actions', async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();

    renderWithProviders(
      <NotificationsInboxSection
        variant="full"
        unreadCount={1}
        pages={notificationPagesFixture}
        isLoadingMore={false}
        hasMore={true}
        onLoadMore={vi.fn()}
        onOpenNotification={onOpenNotification}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
      />,
    );

    expect(
      screen.getByText(m.notification_unread_count({ count: 1 })),
    ).toBeInTheDocument();
    expect(screen.getByText(m.notification_unread_badge())).toBeInTheDocument();

    const [openNotificationButton] = screen.getAllByRole('button', {
      name: m.notification_open_notification(),
    });

    expect(openNotificationButton).toBeDefined();

    if (!openNotificationButton) {
      throw new Error('Expected an open notification button');
    }

    await user.click(openNotificationButton);
    await user.click(
      screen.getByRole('button', { name: m.notification_mark_read() }),
    );
    await user.click(
      screen.getByRole('button', { name: m.notification_mark_all_read() }),
    );

    expect(onOpenNotification).toHaveBeenCalledWith('notification-1');
    expect(onMarkRead).toHaveBeenCalledWith('notification-1');
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when inbox has no notifications', () => {
    renderWithProviders(
      <NotificationsInboxSection
        variant="full"
        unreadCount={0}
        pages={[]}
        isLoadingMore={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText(m.notification_empty_title())).toBeInTheDocument();
    expect(
      screen.getByText(m.notification_empty_description()),
    ).toBeInTheDocument();
  });

  it('shows a loading state instead of the empty state while the first page loads', () => {
    renderWithProviders(
      <NotificationsInboxSection
        variant="full"
        unreadCount={0}
        pages={[]}
        isLoading
        isLoadingMore={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText(m.notification_loading())).toBeInTheDocument();
    expect(
      screen.queryByText(m.notification_empty_title()),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the inbox cannot load', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <NotificationsInboxSection
        variant="full"
        unreadCount={0}
        pages={[]}
        isError
        onRetry={onRetry}
        isLoadingMore={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: m.notification_retry() }),
    );

    expect(screen.getByText(m.notification_load_error())).toBeInTheDocument();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsInboxSection (compact mode — bell dropdown)', () => {
  it('renders a bounded item list without date-bucket grouping', async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();
    const onViewAll = vi.fn();

    renderWithProviders(
      <NotificationsInboxSection
        variant="compact"
        items={recentItemsFixture}
        onOpenNotification={onOpenNotification}
        onMarkRead={vi.fn()}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.queryByText('July 1, 2026')).not.toBeInTheDocument();
    expect(screen.getByText('Assignment updated')).toBeInTheDocument();
    expect(screen.getByText('Availability reminder')).toBeInTheDocument();

    await user.click(screen.getByText('Assignment updated'));
    expect(onOpenNotification).toHaveBeenCalledWith('notification-1');

    await user.click(
      screen.getByRole('link', { name: m.notification_view_all() }),
    );
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when there are no recent notifications', () => {
    renderWithProviders(
      <NotificationsInboxSection
        variant="compact"
        items={[]}
        onOpenNotification={vi.fn()}
        onMarkRead={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByText(m.notification_empty_title())).toBeInTheDocument();
  });
});
