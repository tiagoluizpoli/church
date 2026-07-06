import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { NotificationDetailSheet } from '@/features/volunteers/components/notification-detail-sheet';
import { NotificationsInboxSection } from '@/features/volunteers/components/notifications-inbox-section';
import { useNotificationInbox } from '@/features/volunteers/hooks/use-notification-inbox';
import { resolveNotificationTarget } from '@/features/volunteers/lib/notification-navigation';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/notifications')({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: '/login',
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const navigate = useNavigate();
  const inbox = useNotificationInbox(0);

  const handleOpenContext = () => {
    const notification = inbox.selectedNotification;
    inbox.setSelectedNotificationId(undefined);

    if (!notification) {
      return;
    }

    navigate(resolveNotificationTarget(notification.deepLink));
  };

  return (
    <>
      <NotificationsInboxSection
        variant="full"
        unreadCount={inbox.unreadCount}
        pages={inbox.pages}
        isLoadingMore={inbox.isLoadingMore}
        hasMore={inbox.hasMore}
        onLoadMore={inbox.loadMore}
        onOpenNotification={inbox.openNotification}
        onMarkRead={inbox.markRead}
        onMarkAllRead={inbox.markAllRead}
      />

      <NotificationDetailSheet
        open={inbox.selectedNotification != null}
        notification={inbox.selectedNotification}
        onOpenChange={(open) => {
          if (!open) {
            inbox.setSelectedNotificationId(undefined);
          }
        }}
        onOpenContext={handleOpenContext}
      />
    </>
  );
}
