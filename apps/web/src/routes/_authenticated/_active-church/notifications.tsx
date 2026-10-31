import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { NotificationDetailSheet } from '@/features/notifications/components/notification-detail-sheet';
import { NotificationsInboxSection } from '@/features/notifications/components/notifications-inbox-section';
import { useNotificationInbox } from '@/features/notifications/hooks/use-notification-inbox';
import { openNotificationDestination } from '@/features/notifications/lib/notification-navigation';

export const Route = createFileRoute(
  '/_authenticated/_active-church/notifications',
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const inbox = useNotificationInbox();

  const handleOpenContext = () => {
    const notification = inbox.selectedNotification;
    inbox.setSelectedNotificationId(undefined);
    if (notification) {
      openNotificationDestination({
        item: notification.source,
        navigate: (target) => navigate(target),
      });
    }
  };

  return (
    <>
      <NotificationsInboxSection
        variant="full"
        unreadCount={inbox.unreadCount}
        pages={inbox.pages}
        isLoading={inbox.isLoading}
        isError={inbox.isError}
        onRetry={inbox.refresh}
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
