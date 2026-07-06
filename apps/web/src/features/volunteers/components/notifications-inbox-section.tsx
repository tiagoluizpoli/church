import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@church/ui/components/alert';
import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { ScrollArea } from '@church/ui/components/scroll-area';
import { Link } from '@tanstack/react-router';

export interface NotificationItemViewModel {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAtLabel: string;
  isUnread: boolean;
}

export interface NotificationPageViewModel {
  dateBucketLabel: string;
  items: NotificationItemViewModel[];
}

export interface NotificationsInboxItemActions {
  onOpenNotification: (notificationId: string) => void;
  onMarkRead: (notificationId: string) => void;
}

export interface NotificationsInboxFullModeProps
  extends NotificationsInboxItemActions {
  variant: 'full';
  unreadCount: number;
  pages: NotificationPageViewModel[];
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
}

export interface NotificationsInboxCompactModeProps
  extends NotificationsInboxItemActions {
  variant: 'compact';
  items: NotificationItemViewModel[];
  onViewAll?: () => void;
}

export type NotificationsInboxSectionProps =
  | NotificationsInboxFullModeProps
  | NotificationsInboxCompactModeProps;

function NoNotificationsAlert() {
  return (
    <Alert>
      <AlertTitle>No notifications yet</AlertTitle>
      <AlertDescription>
        Scheduling updates and reminders will appear here.
      </AlertDescription>
    </Alert>
  );
}

function FullModeInbox({
  unreadCount,
  pages,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onOpenNotification,
  onMarkRead,
  onMarkAllRead,
}: NotificationsInboxFullModeProps) {
  const hasNotifications = pages.some((page) => page.items.length > 0);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-balance font-semibold text-2xl tracking-[-0.02em] md:text-3xl">
            Notifications Inbox
          </CardTitle>
          <CardDescription className="text-sm">
            Review schedule history, reminders, and assignment updates.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount > 0 ? 'default' : 'outline'}>
            {unreadCount} unread
          </Badge>
          <Button
            type="button"
            variant="outline"
            disabled={unreadCount === 0}
            onClick={onMarkAllRead}
          >
            Mark all as read
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasNotifications ? (
          <NoNotificationsAlert />
        ) : (
          <ScrollArea className="h-96 pr-4">
            <div className="space-y-6">
              {pages.map((page) => (
                <div key={page.dateBucketLabel} className="space-y-3">
                  <div className="font-medium text-muted-foreground text-sm">
                    {page.dateBucketLabel}
                  </div>
                  <div className="space-y-3">
                    {page.items.map((item) => (
                      <div
                        key={item.id}
                        className={`space-y-3 border p-3 ${
                          item.isUnread ? 'bg-muted/40' : ''
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{item.title}</div>
                              {item.isUnread ? (
                                <Badge variant="secondary">Unread</Badge>
                              ) : null}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {item.body}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {item.createdAtLabel}
                            </div>
                          </div>
                          <Badge variant="outline">{item.type}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenNotification(item.id)}
                          >
                            Open notification
                          </Button>
                          {item.isUnread ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => onMarkRead(item.id)}
                            >
                              Mark as read
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CompactModeInbox({
  items,
  onOpenNotification,
  onViewAll,
}: NotificationsInboxCompactModeProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <NoNotificationsAlert />
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenNotification(item.id)}
              className={`flex flex-col gap-1 rounded-sm p-2 text-left text-sm hover:bg-accent ${
                item.isUnread ? 'bg-muted/40' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.title}</span>
                {item.isUnread ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary">
                    <span className="sr-only">Unread</span>
                  </span>
                ) : null}
              </div>
              <span className="line-clamp-2 text-muted-foreground text-xs">
                {item.body}
              </span>
              <span className="text-muted-foreground text-xs">
                {item.createdAtLabel}
              </span>
            </button>
          ))}
        </div>
      )}
      <Link
        to="/notifications"
        onClick={onViewAll}
        className="text-center text-primary text-sm hover:underline"
      >
        View all
      </Link>
    </div>
  );
}

export function NotificationsInboxSection(
  props: NotificationsInboxSectionProps,
) {
  if (props.variant === 'compact') {
    return <CompactModeInbox {...props} />;
  }

  return <FullModeInbox {...props} />;
}
