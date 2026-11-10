import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from './planning-admin.utils';
import { InstantField } from '@/components/instant-field';
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
import { Label } from '@/components/ui/label';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

export interface EventMovePreviewProps {
  cycleId: string;
  eventId: string;
  title: string;
  /** The Event's current start, the field's initial value. */
  start: Instant;
  size?: 'touch' | 'icon-xs';
}

/**
 * Previews moving a scheduled Event of a Sent Cycle: asks for the new start,
 * then shows the proposed bounds and the typed Volunteer/Ministry clashes.
 * Advisory and write-free; confirming the move is a separate action.
 */
export function EventMovePreview({
  cycleId,
  eventId,
  title,
  start,
  size = 'touch',
}: EventMovePreviewProps) {
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Instant>(start);
  const preview = useMutation({
    mutationFn: () =>
      adminApi.previewPlanningEventMove(cycleId, eventId, { start: target }),
  });
  const result = preview.data;

  const range = (value: { start: string; end: string }) =>
    formatInstantRangeOf({ ...value, timeZone: churchTimezone });

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        aria-label={m.event_move_preview_action_label({ title })}
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="size-3.5" />
        {size === 'touch' ? m.event_move_preview_action() : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="event-move-preview">
          <DialogHeader>
            <DialogTitle>{m.event_move_preview_title({ title })}</DialogTitle>
            <DialogDescription>
              {m.event_move_preview_description()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label id="event-move-start-label" htmlFor="event-move-start-date">
              {m.event_move_preview_start_label()}
            </Label>
            <InstantField
              idPrefix="event-move-start"
              value={target}
              timeZone={churchTimezone}
              aria-labelledby="event-move-start-label"
              onChange={setTarget}
            />
          </div>
          {preview.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {getErrorMessage({ error: preview.error })}
            </p>
          ) : null}
          {result ? (
            <div
              className="space-y-3 text-sm"
              data-testid="move-preview-result"
            >
              <p className="text-muted-foreground">
                {m.event_move_preview_current({
                  range: range(result.event.previous),
                })}
              </p>
              <p className="font-medium">
                {m.event_move_preview_proposed({
                  range: range(result.event.proposed),
                })}
              </p>
              <div>
                <h4 className="font-medium">
                  {m.event_move_preview_blocks_title()}
                </h4>
                <ul className="text-muted-foreground text-xs">
                  {result.eventTimeBlocks.map((block) => (
                    <li key={block.id}>
                      {m.event_move_preview_block({
                        label: block.label ?? '',
                        range: range(block.proposed),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
              {result.clashes.length === 0 ? (
                <p data-testid="move-preview-no-clashes">
                  {m.event_move_preview_no_clashes()}
                </p>
              ) : (
                <div data-testid="move-preview-clashes">
                  <h4 className="font-medium text-destructive">
                    {pluralMessage({
                      count: result.clashes.length,
                      one: () => m.event_move_preview_clashes_title_one(),
                      other: () =>
                        m.event_move_preview_clashes_title_other({
                          count: result.clashes.length,
                        }),
                    })}
                  </h4>
                  <ul className="text-xs">
                    {result.clashes.map((clash) => (
                      <li key={clash.assignmentId}>
                        {m.event_move_preview_clash({
                          volunteer: clash.volunteer.name,
                          ministry: clash.ministry.name,
                          range: range({
                            start: clash.proposedStart,
                            end: clash.proposedEnd,
                          }),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.event_move_preview_close()}
            </DialogClose>
            <Button
              type="button"
              disabled={preview.isPending}
              onClick={() => preview.mutate()}
            >
              {preview.isPending
                ? m.event_move_preview_running()
                : m.event_move_preview_run()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
