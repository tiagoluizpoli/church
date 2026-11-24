import { m } from '@church/i18n/messages';
import {
  addMilliseconds,
  type Instant,
  millisecondsBetween,
} from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { type BoundsRange, ClashList } from './event-move-preview';
import type { CycleCalendarEventTimeBlockRow } from './planning-admin.types';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

const NEW_BLOCK_LENGTH_MS = 60 * 60 * 1000;

export interface EventEditPreviewProps {
  cycleId: string;
  eventId: string;
  title: string;
  start: Instant;
  end: Instant;
  /** Every block of the Event; only the active ones are edited. */
  eventTimeBlocks: CycleCalendarEventTimeBlockRow[];
  size?: 'touch' | 'icon-xs';
}

/** One editable block: `id` is absent for a block this edit adds. */
interface DraftBlock {
  key: string;
  id?: string;
  label: string;
  start: Instant;
  end: Instant;
}

interface Draft {
  start: Instant;
  end: Instant;
  blocks: DraftBlock[];
}

interface PatchBlockInput {
  key: string;
  patch: Partial<DraftBlock>;
}

interface DraftSource {
  start: Instant;
  end: Instant;
  eventTimeBlocks: CycleCalendarEventTimeBlockRow[];
}

function draftOf({ start, end, eventTimeBlocks }: DraftSource): Draft {
  const blocks = eventTimeBlocks
    .filter(({ status }) => status === 'active')
    .map(({ eventTimeBlockId, label, startTime, endTime }) => ({
      key: eventTimeBlockId,
      id: eventTimeBlockId,
      label,
      start: startTime as Instant,
      end: endTime as Instant,
    }));
  return { start, end, blocks };
}

function bodyOf({ start, end, blocks }: Draft) {
  return {
    start,
    end,
    eventTimeBlocks: blocks.map(({ id, label, start: from, end: to }) => ({
      ...(id ? { id } : {}),
      label,
      startTime: from,
      endTime: to,
    })),
  };
}

/**
 * Edits a scheduled Event of a Sent Cycle until it ends: new Event bounds and
 * block times, an added block. The preview is write-free and lists the typed
 * Volunteer/Ministry clashes; confirming applies exactly the previewed body
 * and shows the Assignments the server actually withdrew. Removing a stored
 * block stays the cancel flow, so a stored block is never left out here.
 */
export function EventEditPreview({
  cycleId,
  eventId,
  title,
  start,
  end,
  eventTimeBlocks,
  size = 'touch',
}: EventEditPreviewProps) {
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() =>
    draftOf({ start, end, eventTimeBlocks }),
  );
  const [addedCount, setAddedCount] = useState(0);
  const queryClient = useQueryClient();
  const preview = useMutation({
    mutationFn: (body: ReturnType<typeof bodyOf>) =>
      adminApi.previewPlanningEventEdit(cycleId, eventId, body),
  });
  const apply = useMutation({
    mutationFn: (body: ReturnType<typeof bodyOf>) =>
      adminApi.editPlanningEvent(cycleId, eventId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
        queryClient.invalidateQueries({ queryKey: CYCLE_BUILDER_QUERY_KEY }),
        // Every Ministry's Schedule reads the retimed Shifts.
        queryClient.invalidateQueries({
          predicate: ({ queryKey: [key] }) =>
            typeof key === 'string' && key.startsWith('prepare-'),
        }),
      ]),
  });
  const body = bodyOf(draft);
  const result = preview.data;
  const edited = apply.data;
  // Only the body just previewed is confirmable; any change needs a new preview.
  const canConfirm =
    result !== undefined &&
    JSON.stringify(preview.variables) === JSON.stringify(body) &&
    !edited;
  const error = apply.error ?? preview.error;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) setDraft(draftOf({ start, end, eventTimeBlocks }));
    if (!next) {
      preview.reset();
      apply.reset();
    }
  };
  const patchBlock = ({ key, patch }: PatchBlockInput) =>
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.key === key ? { ...block, ...patch } : block,
      ),
    }));
  const addBlock = () => {
    const key = `added-${addedCount}`;
    setAddedCount(addedCount + 1);
    setDraft((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        {
          key,
          label: m.event_edit_preview_block_new_label(),
          start: current.start,
          end: addMilliseconds({
            instant: current.start,
            milliseconds: Math.min(
              NEW_BLOCK_LENGTH_MS,
              millisecondsBetween({ start: current.start, end: current.end }),
            ),
          }),
        },
      ],
    }));
  };
  const removeBlock = (key: string) =>
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.key !== key),
    }));

  const range = (value: BoundsRange) =>
    formatInstantRangeOf({ ...value, timeZone: churchTimezone });
  const editedRange = edited && range(edited.event);
  const previousRange = result && range(result.event.previous);
  const proposedRange = result && range(result.event.proposed);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        aria-label={m.event_edit_preview_action_label({ title })}
        onClick={() => changeOpen(true)}
      >
        <Pencil className="size-3.5" />
        {size === 'touch' ? m.event_edit_preview_action() : null}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          data-testid="event-edit-preview"
          className="max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{m.event_edit_preview_title({ title })}</DialogTitle>
            <DialogDescription>
              {m.event_edit_preview_description()}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label
                id="event-edit-start-label"
                htmlFor="event-edit-start-date"
              >
                {m.event_edit_preview_start_label()}
              </Label>
              <InstantField
                idPrefix="event-edit-start"
                value={draft.start}
                timeZone={churchTimezone}
                aria-labelledby="event-edit-start-label"
                onChange={(next) =>
                  setDraft((current) => ({ ...current, start: next }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label id="event-edit-end-label" htmlFor="event-edit-end-date">
                {m.event_edit_preview_end_label()}
              </Label>
              <InstantField
                idPrefix="event-edit-end"
                value={draft.end}
                timeZone={churchTimezone}
                aria-labelledby="event-edit-end-label"
                data-testid="event-edit-end"
                onChange={(next) =>
                  setDraft((current) => ({ ...current, end: next }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">
              {m.event_edit_preview_blocks_title()}
            </h4>
            {draft.blocks.map((block, index) => {
              const position = index + 1;
              return (
                <div
                  key={block.key}
                  className="space-y-2 rounded-md border p-3"
                  data-testid="event-edit-block"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={block.label}
                      aria-label={m.event_edit_preview_block_label({
                        position,
                      })}
                      onChange={({ target }) =>
                        patchBlock({
                          key: block.key,
                          patch: { label: target.value },
                        })
                      }
                    />
                    {block.id ? null : (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={m.event_edit_preview_block_remove({
                          position,
                        })}
                        onClick={() => removeBlock(block.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['start', 'end'] as const).map((edge) => {
                      const labelId = `event-edit-${block.key}-${edge}-label`;
                      return (
                        <div key={edge} className="space-y-1">
                          <Label
                            id={labelId}
                            htmlFor={`event-edit-${block.key}-${edge}-date`}
                            className="text-xs"
                          >
                            {edge === 'start'
                              ? m.event_edit_preview_block_start_label({
                                  position,
                                })
                              : m.event_edit_preview_block_end_label({
                                  position,
                                })}
                          </Label>
                          <InstantField
                            idPrefix={`event-edit-${block.key}-${edge}`}
                            value={block[edge]}
                            timeZone={churchTimezone}
                            aria-labelledby={labelId}
                            data-testid={`event-edit-block-${position}-${edge}`}
                            onChange={(next) =>
                              patchBlock({
                                key: block.key,
                                patch: { [edge]: next },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addBlock}
            >
              <Plus className="size-3.5" />
              {m.event_edit_preview_block_add()}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {requestErrorMessage(error)}
            </p>
          ) : null}
          {edited ? (
            <div className="space-y-2 text-sm" data-testid="edit-result">
              <p className="font-medium">
                {m.event_edit_done({ range: editedRange ?? '' })}
              </p>
              {edited.withdrawn.length === 0 ? (
                <p>{m.event_move_withdrawn_none()}</p>
              ) : (
                <div>
                  <h4 className="font-medium text-destructive">
                    {pluralMessage({
                      count: edited.withdrawn.length,
                      one: () => m.event_move_withdrawn_title_one(),
                      other: () =>
                        m.event_move_withdrawn_title_other({
                          count: edited.withdrawn.length,
                        }),
                    })}
                  </h4>
                  <ClashList clashes={edited.withdrawn} range={range} />
                </div>
              )}
            </div>
          ) : result ? (
            <div
              className="space-y-3 text-sm"
              data-testid="edit-preview-result"
            >
              <p className="text-muted-foreground">
                {m.event_edit_preview_current({ range: previousRange ?? '' })}
              </p>
              <p className="font-medium">
                {m.event_edit_preview_proposed({ range: proposedRange ?? '' })}
              </p>
              <ul className="text-muted-foreground text-xs">
                {result.eventTimeBlocks.map((block) => {
                  const { id, label, change, proposed } = block;
                  if (!proposed) return null;
                  const blockRange = range(proposed);
                  return (
                    <li key={id ?? `${label}-${blockRange}`}>
                      {change === 'added'
                        ? m.event_edit_preview_block_added({
                            label: label ?? '',
                            range: blockRange,
                          })
                        : m.event_move_preview_block({
                            label: label ?? '',
                            range: blockRange,
                          })}
                    </li>
                  );
                })}
              </ul>
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
                  {m.event_edit_confirm_hint()}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {m.event_edit_preview_close()}
            </DialogClose>
            {edited ? null : (
              <Button
                type="button"
                variant={canConfirm ? 'outline' : 'default'}
                disabled={preview.isPending || apply.isPending}
                onClick={() => {
                  apply.reset();
                  preview.mutate(body);
                }}
              >
                {preview.isPending ? <Spinner /> : null}
                {preview.isPending
                  ? m.event_edit_preview_running()
                  : m.event_edit_preview_run()}
              </Button>
            )}
            {canConfirm ? (
              <Button
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(body)}
              >
                {apply.isPending ? <Spinner /> : null}
                {apply.isPending
                  ? m.event_edit_confirming()
                  : m.event_edit_confirm()}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
