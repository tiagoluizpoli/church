import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import {
  type NotificationPageViewModel,
  NotificationsInboxSection,
} from '@/features/volunteers/components/notifications-inbox-section';

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

describe('NotificationsInboxSection', () => {
  it('renders unread state and notification actions', async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();

    renderWithProviders(
      <NotificationsInboxSection
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

    expect(screen.getByText('1 unread')).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();

    const [openNotificationButton] = screen.getAllByRole('button', {
      name: 'Open notification',
    });

    expect(openNotificationButton).toBeDefined();

    if (!openNotificationButton) {
      throw new Error('Expected an open notification button');
    }

    await user.click(openNotificationButton);
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(onOpenNotification).toHaveBeenCalledWith('notification-1');
    expect(onMarkRead).toHaveBeenCalledWith('notification-1');
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when inbox has no notifications', () => {
    renderWithProviders(
      <NotificationsInboxSection
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

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(
      screen.getByText('Scheduling updates and reminders will appear here.'),
    ).toBeInTheDocument();
  });
});
