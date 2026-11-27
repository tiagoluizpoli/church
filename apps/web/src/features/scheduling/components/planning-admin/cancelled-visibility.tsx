import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { CANCELLATION_READERS } from './event-cancel-dialog';
import { refreshPlanning } from './refresh-planning';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

/** Marks a cancelled Event or time block that only ChurchAdmins still see. */
export function HiddenBadge() {
  return (
    <Badge variant="outline" className="shrink-0">
      <EyeOff />
      {m.event_status_hidden()}
    </Badge>
  );
}

export interface CancelledVisibilityActionProps {
  cycleId: string;
  eventId: string;
  /** Hides or shows only this block through the nested endpoint. */
  eventTimeBlockId?: string;
  title: string;
  isHidden: boolean;
  size?: 'touch' | 'icon-xs';
}

/** Hides a cancelled Event or time block, or shows it again, once confirmed. */
export function CancelledVisibilityAction({
  cycleId,
  eventId,
  eventTimeBlockId,
  title,
  isHidden,
  size = 'touch',
}: CancelledVisibilityActionProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (hidden: boolean) =>
      eventTimeBlockId
        ? adminApi.setPlanningEventTimeBlockHidden(
            cycleId,
            eventId,
            eventTimeBlockId,
            { hidden },
          )
        : adminApi.setPlanningEventHidden(cycleId, eventId, { hidden }),
    onSuccess: () => {
      setOpen(false);
      return refreshPlanning({
        queryClient,
        cycleId,
        readers: CANCELLATION_READERS,
      });
    },
  });
  const hideAction = eventTimeBlockId
    ? m.event_hide_block_action()
    : m.event_hide_action();
  const showAction = eventTimeBlockId
    ? m.event_show_block_action()
    : m.event_show_action();
  const action = isHidden ? showAction : hideAction;
  const Icon = isHidden ? Eye : EyeOff;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) change.reset();
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        aria-label={m.event_visibility_action_label({ action, title })}
        onClick={() => setOpen(true)}
      >
        <Icon className="size-3.5" />
        {size === 'touch' ? action : null}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isHidden
                ? m.event_show_title({ title })
                : m.event_hide_title({ title })}
            </DialogTitle>
            <DialogDescription>
              {isHidden
                ? m.event_show_description()
                : m.event_hide_description()}
            </DialogDescription>
          </DialogHeader>
          {change.error ? (
            <p role="alert" className="text-destructive text-sm">
              {requestErrorMessage(change.error)}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.event_cancel_done_close()}
            </DialogClose>
            <Button
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate(!isHidden)}
            >
              {change.isPending ? <Spinner /> : null}
              {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
