import { Badge } from '@church/ui/components/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@church/ui/components/popover';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { NotificationsInboxSection } from '@/features/volunteers/components/notifications-inbox-section';
import type { NotificationInboxItem } from '@/features/volunteers/hooks/use-notification-inbox';
import { useNotificationInbox } from '@/features/volunteers/hooks/use-notification-inbox';
import { resolveNotificationTarget } from '@/features/volunteers/lib/notification-navigation';

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
  const navigate = useNavigate();
  const inbox = useNotificationInbox(0);
  const bellViewModel = selectNotificationBellViewModel({
    items: inbox.items,
    unreadCount: inbox.unreadCount,
    hasMore: inbox.hasMore,
  });

  const handleOpenNotification = (notificationId: string) => {
    const notification = inbox.items.find((item) => item.id === notificationId);
    inbox.markRead(notificationId);
    setOpen(false);

    const target = notification
      ? resolveNotificationTarget(notification.deepLink)
      : { to: '/notifications' as const };
    navigate(target);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="h-5 w-5" />
        {bellViewModel.unreadCount > 0 ? (
          <Badge className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]">
            {bellViewModel.unreadCount}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <NotificationsInboxSection
          variant="compact"
          items={bellViewModel.recentItems}
          onOpenNotification={handleOpenNotification}
          onMarkRead={inbox.markRead}
          onViewAll={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
