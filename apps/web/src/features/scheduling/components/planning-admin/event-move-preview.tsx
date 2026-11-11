import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
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
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

interface BoundsRange {
  start: string;
  end: string;
}

export interface EventMovePreviewProps {
  cycleId: string;
  eventId: string;
  title: string;
  /** Moves only this EventTimeBlock (the Event stretches) instead of the Event. */
  eventTimeBlockId?: string;
  /** The scope's current start, the field's initial value. */
  start: Instant;
  size?: 'touch' | 'icon-xs';
}

interface MoveClashRow {
  assignmentId: string;
  volunteer: { name: string };
  ministry: { name: string };
  proposedStart: string;
  proposedEnd: string;
}

/**
 * Previews moving a scheduled Event of a Sent Cycle: asks for the new start,
 * then shows the proposed bounds and the typed Volunteer/Ministry clashes.
 * The preview is write-free; an explicit confirm of the previewed start moves
 * the Event and shows the Assignments the server actually withdrew.
 */
export function EventMovePreview({
  cycleId,
  eventId,
  title,
  eventTimeBlockId,
  start,
  size = 'touch',
}: EventMovePreviewProps) {
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Instant>(start);
  const queryClient = useQueryClient();
  const preview = useMutation({
    mutationFn: (value: Instant) =>
      eventTimeBlockId
        ? adminApi.previewPlanningEventTimeBlockMove(
            cycleId,
            eventId,
            eventTimeBlockId,
            { start: value },
          )
        : adminApi.previewPlanningEventMove(cycleId, eventId, { start: value }),
  });
  const move = useMutation({
    mutationFn: (value: Instant) =>
      eventTimeBlockId
        ? adminApi.movePlanningEventTimeBlock(
            cycleId,
            eventId,
            eventTimeBlockId,
            { start: value },
          )
        : adminApi.movePlanningEvent(cycleId, eventId, { start: value }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
        queryClient.invalidateQueries({ queryKey: CYCLE_BUILDER_QUERY_KEY }),
        // Every Ministry's Schedule reads the moved Shifts.
        queryClient.invalidateQueries({
          predicate: ({ queryKey: [key] }) =>
            typeof key === 'string' && key.startsWith('prepare-'),
        }),
      ]),
  });
  const result = preview.data;
  const moved = move.data;
  // Only the start just previewed is confirmable; a changed field needs a new preview.
  const canConfirm =
    result !== undefined && preview.variables === target && !moved;
  const error = move.error ?? preview.error;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      preview.reset();
      move.reset();
    }
  };

  const range = (value: BoundsRange) =>
    formatInstantRangeOf({ ...value, timeZone: churchTimezone });
  const movedRange = moved && range(moved.event);
  const previousRange = result && range(result.event.previous);
  const proposedRange = result && range(result.event.proposed);

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
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          data-testid={
            eventTimeBlockId ? 'block-move-preview' : 'event-move-preview'
          }
        >
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
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {requestErrorMessage(error)}
            </p>
          ) : null}
          {moved ? (
            <div className="space-y-2 text-sm" data-testid="move-result">
              <p className="font-medium">
                {m.event_move_done({ range: movedRange ?? '' })}
              </p>
              {moved.withdrawn.length === 0 ? (
                <p>{m.event_move_withdrawn_none()}</p>
              ) : (
                <div>
                  <h4 className="font-medium text-destructive">
                    {pluralMessage({
                      count: moved.withdrawn.length,
                      one: () => m.event_move_withdrawn_title_one(),
                      other: () =>
                        m.event_move_withdrawn_title_other({
                          count: moved.withdrawn.length,
                        }),
                    })}
                  </h4>
                  <ClashList clashes={moved.withdrawn} range={range} />
                </div>
              )}
            </div>
          ) : result ? (
            <div
              className="space-y-3 text-sm"
              data-testid="move-preview-result"
            >
              <p className="text-muted-foreground">
                {m.event_move_preview_current({ range: previousRange ?? '' })}
              </p>
              <p className="font-medium">
                {m.event_move_preview_proposed({ range: proposedRange ?? '' })}
              </p>
              <div>
                <h4 className="font-medium">
                  {m.event_move_preview_blocks_title()}
                </h4>
                <ul className="text-muted-foreground text-xs">
                  {result.eventTimeBlocks.map(({ id, label, proposed }) => {
                    const blockRange = range(proposed);
                    return (
                      <li key={id}>
                        {m.event_move_preview_block({
                          label: label ?? '',
                          range: blockRange,
                        })}
                      </li>
                    );
                  })}
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
                  <ClashList clashes={result.clashes} range={range} />
                </div>
              )}
              {canConfirm ? (
                <p className="text-muted-foreground text-xs">
                  {m.event_move_confirm_hint()}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.event_move_preview_close()}
            </DialogClose>
            {moved ? null : (
              <Button
                type="button"
                variant={canConfirm ? 'outline' : 'default'}
                disabled={preview.isPending || move.isPending}
                onClick={() => {
                  move.reset();
                  preview.mutate(target);
                }}
              >
                {preview.isPending
                  ? m.event_move_preview_running()
                  : m.event_move_preview_run()}
              </Button>
            )}
            {canConfirm ? (
              <Button
                type="button"
                disabled={move.isPending}
                onClick={() => move.mutate(target)}
              >
                {move.isPending
                  ? m.event_move_confirming()
                  : m.event_move_confirm()}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ClashListProps {
  clashes: MoveClashRow[];
  range: (value: BoundsRange) => string;
}

function ClashList({ clashes, range }: ClashListProps) {
  return (
    <ul className="text-xs">
      {clashes.map(
        ({ assignmentId, volunteer, ministry, proposedStart, proposedEnd }) => {
          const clashRange = range({ start: proposedStart, end: proposedEnd });
          return (
            <li key={assignmentId}>
              {m.event_move_preview_clash({
                volunteer: volunteer.name,
                ministry: ministry.name,
                range: clashRange,
              })}
            </li>
          );
        },
      )}
    </ul>
  );
}
