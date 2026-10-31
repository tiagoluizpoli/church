import { m } from '@church/i18n/messages';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { MobileDrawer } from '@/components/mobile-drawer';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { NotificationDetailSheet } from '@/features/notifications/components/notification-detail-sheet';
import { NotificationsInboxSection } from '@/features/notifications/components/notifications-inbox-section';
import type { NotificationInboxItem } from '@/features/notifications/hooks/use-notification-inbox';
import { useNotificationInbox } from '@/features/notifications/hooks/use-notification-inbox';
import { openNotificationDestination } from '@/features/notifications/lib/notification-navigation';
import { useMediaQuery } from '@/hooks/use-media-query';

const BELL_MAX_ITEMS = 5;

export interface NotificationBellViewModel {
  unreadCount: number;
  recentItems: NotificationInboxItem[];
  hasMore: boolean;
}

interface SelectNotificationBellViewModelInput {
  items: NotificationInboxItem[];
  unreadCount: number;
  hasMore: boolean;
}

function selectNotificationBellViewModel({
  items,
  unreadCount,
  hasMore,
}: SelectNotificationBellViewModelInput): NotificationBellViewModel {
  const unreadFirst = [...items].sort((a, b) =>
    a.isUnread === b.isUnread ? 0 : a.isUnread ? -1 : 1,
  );

  return {
    unreadCount,
    recentItems: unreadFirst.slice(0, BELL_MAX_ITEMS),
    hasMore,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const navigate = useNavigate();
  const inbox = useNotificationInbox();
  const bellViewModel = selectNotificationBellViewModel({
    items: inbox.items,
    unreadCount: inbox.unreadCount,
    hasMore: inbox.hasMore,
  });

  // Selecting opens the detail sheet and marks it read; only Open navigates.
  const handleSelectNotification = (notificationId: string) => {
    setOpen(false);
    inbox.openNotification(notificationId);
  };

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

  const inboxContent = (
    <NotificationsInboxSection
      variant="compact"
      items={bellViewModel.recentItems}
      isLoading={inbox.isLoading}
      isError={inbox.isError}
      onRetry={inbox.refresh}
      onOpenNotification={handleSelectNotification}
      onMarkRead={inbox.markRead}
      onViewAll={() => setOpen(false)}
    />
  );

  const detailSheet = (
    <NotificationDetailSheet
      open={inbox.selectedNotification != null}
      notification={inbox.selectedNotification}
      onOpenChange={(next) => {
        if (!next) inbox.setSelectedNotificationId(undefined);
      }}
      onOpenContext={handleOpenContext}
    />
  );

  if (!isDesktop) {
    return (
      <>
        <button
          type="button"
          aria-label={m.notification_bell_label()}
          onClick={() => setOpen(true)}
          className="radius-icon relative flex h-11 w-11 items-center justify-center border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Bell className="h-5 w-5" />
          {bellViewModel.unreadCount > 0 ? (
            <Badge className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px]">
              {bellViewModel.unreadCount}
            </Badge>
          ) : null}
        </button>
        <MobileDrawer
          open={open}
          onOpenChange={setOpen}
          title={m.notification_bell_label()}
          description={m.notification_bell_description()}
        >
          {inboxContent}
        </MobileDrawer>
        {detailSheet}
      </>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={m.notification_bell_label()}
          className="radius-icon relative flex h-8 w-8 items-center justify-center border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Bell className="h-4 w-4" />
          {bellViewModel.unreadCount > 0 ? (
            <Badge className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px]">
              {bellViewModel.unreadCount}
            </Badge>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          {inboxContent}
        </PopoverContent>
      </Popover>
      {detailSheet}
    </>
  );
}
