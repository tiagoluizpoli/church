import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { NotificationDetailSheet } from '@/features/volunteers/components/notification-detail-sheet';
import { NotificationsInboxSection } from '@/features/volunteers/components/notifications-inbox-section';
import { useNotificationInbox } from '@/features/volunteers/hooks/use-notification-inbox';
import { resolveNotificationTarget } from '@/features/volunteers/lib/notification-navigation';

export const Route = createFileRoute(
  '/_authenticated/_active-church/notifications',
)({
  component: RouteComponent,
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
