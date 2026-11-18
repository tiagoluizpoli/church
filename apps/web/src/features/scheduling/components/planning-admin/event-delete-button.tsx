import { m } from '@church/i18n/messages';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteEvent } from './use-delete-event';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface EventDeleteButtonProps {
  cycleId: string;
  eventId: string;
  title: string;
}

/** Delete (never Cancel) a Draft Event after confirmation. The dialog stays
 * open while pending and after a failure, so the admin can retry. */
export function EventDeleteButton({
  cycleId,
  eventId,
  title,
}: EventDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const { pending, error, onDelete } = useDeleteEvent({ cycleId, eventId });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="destructive"
            data-testid="event-delete-open"
          >
            <Trash2 className="size-3.5" /> {m.event_editor_delete()}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.event_editor_delete_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.event_editor_delete_description({ title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p
            role="alert"
            className="text-destructive text-sm"
            data-testid="event-delete-error"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {m.event_editor_delete_dismiss()}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            data-testid="event-delete-confirm"
            onClick={(event) => {
              // Keep the dialog open until the request settles.
              event.preventDefault();
              onDelete();
            }}
          >
            {pending
              ? m.event_editor_deleting()
              : m.event_editor_delete_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
