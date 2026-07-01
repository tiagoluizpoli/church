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

export interface NotificationsInboxSectionProps {
  unreadCount: number;
  pages: NotificationPageViewModel[];
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenNotification: (notificationId: string) => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsInboxSection({
  unreadCount,
  pages,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onOpenNotification,
  onMarkRead,
  onMarkAllRead,
}: NotificationsInboxSectionProps) {
  const hasNotifications = pages.some((page) => page.items.length > 0);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle>Notifications Inbox</CardTitle>
          <CardDescription>
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
          <Alert>
            <AlertTitle>No notifications yet</AlertTitle>
            <AlertDescription>
              Scheduling updates and reminders will appear here.
            </AlertDescription>
          </Alert>
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
