import type { NotificationInboxItem } from '../hooks/use-notification-inbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface NotificationDetailSheetProps {
  notification?: NotificationInboxItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenContext: () => void;
}

function getContextLabel(
  notification: NotificationInboxItem | undefined,
): string {
  switch (notification?.deepLink.section) {
    case 'availability':
      return 'Open availability task';
    case 'assignments':
      return 'Open assignments';
    case 'ministry_schedule':
      return 'Open ministry schedule';
    default:
      return 'Back to inbox';
  }
}

export function NotificationDetailSheet({
  notification,
  open,
  onOpenChange,
  onOpenContext,
}: NotificationDetailSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{notification?.title ?? 'Notification'}</DialogTitle>
          <DialogDescription>
            {notification?.createdAtLabel ?? ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-6">{notification?.body}</p>
          <div className="flex justify-end">
            <Button type="button" onClick={onOpenContext}>
              {getContextLabel(notification)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
