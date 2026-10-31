import { m } from '@church/i18n/messages';
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
  /** The one way out of the sheet to the notification's destination. */
  onOpenContext: () => void;
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
          <DialogTitle>
            {notification?.title ?? m.notification_detail_fallback_title()}
          </DialogTitle>
          <DialogDescription>
            {notification?.createdAtLabel ?? ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="whitespace-pre-line text-sm leading-6">
            {notification?.body}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onOpenContext}>
              {m.notification_open_context()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
