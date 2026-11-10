import { m } from '@church/i18n/messages';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import { summarizeCycleStaffing } from '@/features/scheduling/utils/builder/cycle-builder-staffing.utils';

interface SchedulePublishProps {
  ministryId: string;
  cycleId: string;
}

/** The same Schedule-wide confirmation available on the Assign board. */
export function SchedulePublish({ ministryId, cycleId }: SchedulePublishProps) {
  const [open, setOpen] = useState(false);
  const { data, publish, sendUpdates } = useCycleBuilder({
    ministryId,
    cycleId,
  });
  if (!data) return null;
  const events = data.events.filter(
    (event) =>
      event.status !== 'cancelled' &&
      (event.state === 'assigning' || event.state === 'availability_requested'),
  );
  const sendButton =
    (data.affectedVolunteerCount ?? 0) > 0 ? (
      <Button
        type="button"
        disabled={sendUpdates.isPending}
        onClick={() => sendUpdates.mutate()}
      >
        {m.builder_send_updates({ count: data.affectedVolunteerCount ?? 0 })}
      </Button>
    ) : null;
  if (events.length === 0) return sendButton;
  const staffing = summarizeCycleStaffing({ data: { ...data, events } });
  const below = staffing.shiftsBelowTarget > 0;
  return (
    <>
      {sendButton}
      <Button
        type="button"
        disabled={publish.isPending}
        onClick={() => setOpen(true)}
      >
        {m.builder_ui_publish()}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.builder_ui_publish_title()}</DialogTitle>
            <DialogDescription>
              {below
                ? m.builder_ui_publish_gaps({
                    places: staffing.required - staffing.coveredPlaces,
                    shifts: staffing.shiftsBelowTarget,
                  })
                : m.builder_ui_publish_full()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {m.builder_ui_cancel()}
            </Button>
            <Button
              type="button"
              disabled={publish.isPending}
              onClick={() => {
                setOpen(false);
                publish.mutate(below);
              }}
            >
              {m.builder_ui_publish()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
