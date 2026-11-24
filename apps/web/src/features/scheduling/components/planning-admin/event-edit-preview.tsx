import { m } from '@church/i18n/messages';
import {
  addMilliseconds,
  compareInstants,
  type Instant,
  millisecondsBetween,
} from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleCheck,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  type EventSaveRefusal,
  toEventSaveRefusal,
} from './event-editor.utils';
import { type BoundsRange, ClashList } from './event-move-preview';
import type { CycleCalendarEventTimeBlockRow } from './planning-admin.types';
import { refreshPlanning } from './refresh-planning';
import { InstantField } from '@/components/instant-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  dayOf,
  formatInstantOf,
  formatInstantRangeOf,
  formatTimeOf,
} from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

const NEW_BLOCK_LENGTH_MS = 60 * 60 * 1000;
const EVENT_PAIR = 'event';

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

type EditBody = ReturnType<typeof bodyOf>;

interface SameBodyInput {
  left: EditBody | undefined;
  right: EditBody;
}

function sameBody({ left, right }: SameBodyInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface PairDatesInput {
  key: string;
  values: Instant[];
}

interface ShowDatesInput {
  key: string;
  /** The date field that takes focus once shown. */
  focusId: string;
}

interface MarkInput {
  text: string;
  moved: boolean;
}

interface PairMessages {
  /** Time-pair messages by pair key (`event` or a block key). */
  times: Map<string, string>;
  /** Label messages by block key. */
  labels: Map<string, string>;
  /** A refusal that names no field here. */
  form: string | undefined;
  /** A pair ends at or before its start: nothing to preview yet. */
  invalid: boolean;
}

interface PairMessagesInput {
  draft: Draft;
  refusal: EventSaveRefusal | null;
}

/** The client end-after-start rule per pair, else the server refusal placed on
 * the pair (or label) it names. */
function pairMessagesOf({ draft, refusal }: PairMessagesInput): PairMessages {
  const times = new Map<string, string>();
  const labels = new Map<string, string>();
  let form: string | undefined;
  const target = refusal?.target;
  if (refusal && target) {
    if (target.kind === 'start' || target.kind === 'end') {
      times.set(EVENT_PAIR, refusal.message);
    } else if (target.kind === 'block' && draft.blocks[target.index]) {
      const { key } = draft.blocks[target.index] as DraftBlock;
      (target.part === 'label' ? labels : times).set(key, refusal.message);
    } else {
      form = refusal.message;
    }
  }
  const pairs = [
    { key: EVENT_PAIR, start: draft.start, end: draft.end },
    ...draft.blocks,
  ];
  let invalid = false;
  for (const { key, start, end } of pairs) {
    if (compareInstants({ left: end, right: start }) <= 0) {
      times.set(key, m.error_validation_invalid_event_bounds());
      invalid = true;
    }
  }
  return { times, labels, form, invalid };
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
  // Pairs whose dates the admin asked to see although they sit on the Event's day.
  const [datesShown, setDatesShown] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const resultRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const preview = useMutation({
    mutationFn: (body: EditBody) =>
      adminApi.previewPlanningEventEdit(cycleId, eventId, body),
  });
  const apply = useMutation({
    mutationFn: (body: EditBody) =>
      adminApi.editPlanningEvent(cycleId, eventId, body),
    onSuccess: () => refreshPlanning({ queryClient, cycleId }),
  });
  const body = bodyOf(draft);
  const storedBody = bodyOf(draftOf({ start, end, eventTimeBlocks }));
  const result = preview.data;
  const edited = apply.data;
  // The preview ran on the stored times: there is nothing to apply.
  const previewUnchanged =
    result !== undefined &&
    sameBody({ left: preview.variables, right: storedBody });
  // Only the body just previewed is confirmable; any change needs a new preview.
  const canConfirm =
    result !== undefined &&
    !previewUnchanged &&
    sameBody({ left: preview.variables, right: body }) &&
    !edited;
  const error = apply.error ?? preview.error;
  const messages = pairMessagesOf({
    draft,
    refusal: error ? toEventSaveRefusal({ error }) : null,
  });

  // Stacked (narrow) layouts show the outcome above the fields: bring it into view.
  useEffect(() => {
    if (result || edited)
      resultRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [result, edited]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDraft(draftOf({ start, end, eventTimeBlocks }));
      setDatesShown(new Set());
    }
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

  const eventDay = dayOf({ value: draft.start, timeZone: churchTimezone });
  const onEventDay = (...values: Instant[]) =>
    values.every(
      (value) => dayOf({ value, timeZone: churchTimezone }) === eventDay,
    );
  const datesHidden = ({ key, values }: PairDatesInput) =>
    !datesShown.has(key) && onEventDay(...values);
  /** Reveals a pair's dates and moves focus to the first one shown. */
  const showDates = ({ key, focusId }: ShowDatesInput) => {
    flushSync(() => setDatesShown((current) => new Set(current).add(key)));
    document.getElementById(focusId)?.focus();
  };

  const range = (value: BoundsRange) =>
    formatInstantRangeOf({ ...value, timeZone: churchTimezone });
  const storedLabels = new Map(
    eventTimeBlocks.map(({ eventTimeBlockId, label }) => [
      eventTimeBlockId,
      label,
    ]),
  );
  const endHidden = datesHidden({ key: EVENT_PAIR, values: [draft.end] });
  const eventError = messages.times.get(EVENT_PAIR);

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
      <ResponsiveFormSurface
        open={open}
        onOpenChange={changeOpen}
        title={m.event_edit_preview_title({ title })}
        description={m.event_edit_preview_description()}
        closeLabel={m.event_edit_preview_dismiss({ title })}
        data-testid="event-edit-preview"
        wide
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
            >
              {m.event_edit_preview_close()}
            </Button>
            {edited ? null : (
              <Button
                type="button"
                variant={canConfirm ? 'outline' : 'default'}
                disabled={
                  messages.invalid || preview.isPending || apply.isPending
                }
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
          </>
        }
      >
        <div className="@container">
          <div className="grid @[52rem]:grid-cols-[minmax(0,1fr)_19rem] gap-6">
            <div className="@container min-w-0 space-y-5">
              <TimePair
                id="event-edit"
                startLabel={m.event_edit_preview_start_label()}
                endLabel={m.event_edit_preview_end_label()}
                start={draft.start}
                end={draft.end}
                timeZone={churchTimezone}
                startDateHidden={false}
                endDateHidden={endHidden}
                error={eventError}
                otherDayLabel={m.event_edit_preview_other_day_end()}
                onShowDates={() =>
                  showDates({ key: EVENT_PAIR, focusId: 'event-edit-end-date' })
                }
                onChange={(patch) =>
                  setDraft((current) => ({ ...current, ...patch }))
                }
              />
              <section
                className="space-y-2"
                aria-labelledby="event-edit-blocks-title"
              >
                <h3
                  id="event-edit-blocks-title"
                  className="font-medium text-sm"
                >
                  {m.event_edit_preview_blocks_title()}
                </h3>
                {draft.blocks.map((block, index) => (
                  <BlockRow
                    key={block.key}
                    block={block}
                    position={index + 1}
                    timeZone={churchTimezone}
                    datesHidden={datesHidden({
                      key: block.key,
                      values: [block.start, block.end],
                    })}
                    timeError={messages.times.get(block.key)}
                    labelError={messages.labels.get(block.key)}
                    onShowDates={() =>
                      showDates({
                        key: block.key,
                        focusId: `event-edit-${block.key}-start-date`,
                      })
                    }
                    onPatch={(patch) => patchBlock({ key: block.key, patch })}
                    onRemove={() => removeBlock(block.key)}
                  />
                ))}
                <Button type="button" variant="outline" onClick={addBlock}>
                  <Plus className="size-3.5" />
                  {m.event_edit_preview_block_add()}
                </Button>
              </section>
            </div>
            <section
              ref={resultRef}
              aria-labelledby="event-edit-result-title"
              aria-live="polite"
              className={
                result || edited || messages.form
                  ? 'surface-subtle @[52rem]:sticky @[52rem]:top-0 @[52rem]:order-none order-first space-y-3 self-start p-4 text-sm'
                  : // Before a preview the panel only holds the beside slot.
                    'surface-subtle @[52rem]:sticky @[52rem]:top-0 @[52rem]:block hidden self-start p-4 text-sm'
              }
            >
              <h3 id="event-edit-result-title" className="font-medium text-sm">
                {m.event_edit_preview_result_title()}
              </h3>
              {messages.form ? (
                <p role="alert" className="text-destructive text-sm">
                  {messages.form}
                </p>
              ) : null}
              {edited ? (
                <div className="space-y-2" data-testid="edit-result">
                  <StatusLine tone="success">
                    {m.event_edit_done({ range: range(edited.event) })}
                  </StatusLine>
                  {edited.withdrawn.length === 0 ? (
                    <p>{m.event_move_withdrawn_none()}</p>
                  ) : (
                    <div>
                      <StatusLine tone="destructive" heading>
                        {pluralMessage({
                          count: edited.withdrawn.length,
                          one: () => m.event_move_withdrawn_title_one(),
                          other: () =>
                            m.event_move_withdrawn_title_other({
                              count: edited.withdrawn.length,
                            }),
                        })}
                      </StatusLine>
                      <ClashList clashes={edited.withdrawn} range={range} />
                    </div>
                  )}
                </div>
              ) : result ? (
                <div className="space-y-3" data-testid="edit-preview-result">
                  {previewUnchanged ? (
                    <p className="text-muted-foreground">
                      {m.event_edit_preview_unchanged()}
                    </p>
                  ) : (
                    <>
                      <dl className="space-y-2">
                        <DiffLine
                          label={title}
                          previous={result.event.previous}
                          proposed={result.event.proposed}
                          timeZone={churchTimezone}
                        />
                        {result.eventTimeBlocks.map((block) => {
                          const { id, label, change, previous, proposed } =
                            block;
                          if (!proposed) return null;
                          const storedLabel = id
                            ? storedLabels.get(id)
                            : undefined;
                          return (
                            <DiffLine
                              key={id ?? `${label}-${range(proposed)}`}
                              label={label ?? ''}
                              previousLabel={storedLabel}
                              previous={change === 'added' ? null : previous}
                              proposed={proposed}
                              timeZone={churchTimezone}
                            />
                          );
                        })}
                      </dl>
                      {result.clashes.length === 0 ? (
                        <div data-testid="move-preview-no-clashes">
                          <StatusLine tone="success">
                            {m.event_move_preview_no_clashes()}
                          </StatusLine>
                        </div>
                      ) : (
                        <div data-testid="move-preview-clashes">
                          <StatusLine tone="destructive" heading>
                            {pluralMessage({
                              count: result.clashes.length,
                              one: () =>
                                m.event_move_preview_clashes_title_one(),
                              other: () =>
                                m.event_move_preview_clashes_title_other({
                                  count: result.clashes.length,
                                }),
                            })}
                          </StatusLine>
                          <ClashList clashes={result.clashes} range={range} />
                        </div>
                      )}
                      {canConfirm ? (
                        <p className="text-muted-foreground text-xs">
                          {m.event_edit_confirm_hint()}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : messages.form ? null : (
                <p className="text-muted-foreground">
                  {m.event_edit_preview_empty()}
                </p>
              )}
            </section>
          </div>
        </div>
      </ResponsiveFormSurface>
    </>
  );
}

interface StatusLineProps {
  tone: 'success' | 'destructive';
  /** A title over a list (h4) rather than a sentence. */
  heading?: boolean;
  children: ReactNode;
}

function StatusLine({ tone, heading = false, children }: StatusLineProps) {
  const Tag = heading ? 'h4' : 'p';
  return (
    <Tag
      className={
        tone === 'success'
          ? 'flex items-start gap-1.5 font-medium text-green-700 dark:text-green-400'
          : 'flex items-start gap-1.5 font-medium text-destructive'
      }
    >
      {tone === 'success' ? (
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{children}</span>
    </Tag>
  );
}

interface DiffLineProps {
  label: string;
  /** The stored name, when it differs from `label` it is shown struck out. */
  previousLabel?: string;
  /** `null` for a block this edit adds. */
  previous: BoundsRange | null;
  proposed: BoundsRange;
  timeZone: string;
}

/** One preview line: unchanged reads plainly; a change reads before → after
 * with only the moved start or end marked as new. */
function DiffLine({
  label,
  previousLabel,
  previous,
  proposed,
  timeZone,
}: DiffLineProps) {
  const renamed = previousLabel !== undefined && previousLabel !== label;
  const name = renamed ? (
    <>
      <del className="text-muted-foreground">{previousLabel}</del>{' '}
      <ArrowRight aria-hidden className="inline size-3.5" />{' '}
      <ins className="font-bold no-underline">{label}</ins>
    </>
  ) : (
    label
  );
  if (!previous) {
    return (
      <div>
        <dt className="font-medium">{name}</dt>
        <dd>
          <ins className="font-bold no-underline">
            {m.event_edit_preview_block_added({
              label,
              range: formatInstantRangeOf({ ...proposed, timeZone }),
            })}
          </ins>
        </dd>
      </div>
    );
  }
  const startMoved = previous.start !== proposed.start;
  const endMoved = previous.end !== proposed.end;
  if (!startMoved && !endMoved) {
    return (
      <div>
        <dt className="font-medium">{name}</dt>
        <dd className="text-muted-foreground">
          {formatInstantRangeOf({ ...proposed, timeZone })}
        </dd>
      </div>
    );
  }
  const startText = formatInstantOf({ value: proposed.start, timeZone });
  const endText =
    dayOf({ value: proposed.start, timeZone }) ===
    dayOf({ value: proposed.end, timeZone })
      ? formatTimeOf({ value: proposed.end, timeZone })
      : formatInstantOf({ value: proposed.end, timeZone });
  const mark = ({ text, moved }: MarkInput) =>
    moved ? <ins className="font-bold no-underline">{text}</ins> : text;
  return (
    <div>
      <dt className="font-medium">{name}</dt>
      <dd className="text-muted-foreground">
        <del>{formatInstantRangeOf({ ...previous, timeZone })}</del>
      </dd>
      <dd className="flex items-center gap-1.5">
        <ArrowRight aria-hidden className="size-3.5 shrink-0" />
        <span>
          {mark({ text: startText, moved: startMoved })} –{' '}
          {mark({ text: endText, moved: endMoved })}
        </span>
      </dd>
    </div>
  );
}

interface PairPatch {
  start?: Instant;
  end?: Instant;
}

interface TimePairProps {
  /** Prefix for ids and test ids: `<id>-start`, `<id>-end`, `<id>-error`. */
  id: string;
  startLabel: string;
  endLabel: string;
  start: Instant;
  end: Instant;
  timeZone: string;
  startDateHidden: boolean;
  endDateHidden: boolean;
  error: string | undefined;
  otherDayLabel: string;
  /** `data-testid` prefix for the start/end fields, when not `id`. */
  testId?: string;
  onShowDates: () => void;
  onChange: (patch: PairPatch) => void;
}

/** A start/end pair: side by side when each has room, stacked otherwise, its
 * error under it. With its dates hidden it shows times and an "Other day"
 * control to reveal them. */
function TimePair({
  id,
  startLabel,
  endLabel,
  start,
  end,
  timeZone,
  startDateHidden,
  endDateHidden,
  error,
  otherDayLabel,
  testId = id,
  onShowDates,
  onChange,
}: TimePairProps) {
  const errorId = `${id}-error`;
  const anyHidden = startDateHidden || endDateHidden;
  const field = (edge: 'start' | 'end') => {
    const labelId = `${id}-${edge}-label`;
    const dateHidden = edge === 'start' ? startDateHidden : endDateHidden;
    return (
      <div
        className={
          // In the inline row a dated field takes a full line until it fits beside.
          anyHidden && !dateHidden
            ? '@[34rem]:w-80 w-full min-w-0 space-y-1'
            : 'min-w-0 space-y-1'
        }
      >
        <Label
          id={labelId}
          htmlFor={`${id}-${edge}-${dateHidden ? 'time' : 'date'}`}
        >
          {edge === 'start' ? startLabel : endLabel}
        </Label>
        <InstantField
          idPrefix={`${id}-${edge}`}
          value={edge === 'start' ? start : end}
          timeZone={timeZone}
          dateHidden={dateHidden}
          aria-labelledby={labelId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={`${testId}-${edge}`}
          onChange={(next) => onChange({ [edge]: next })}
        />
      </div>
    );
  };
  return (
    <div className="space-y-1.5">
      <div
        className={
          anyHidden
            ? 'flex flex-wrap items-end gap-x-3 gap-y-2'
            : // Two columns only when each gets ~260px; a pair needs 1fr + 7rem.
              'grid @[34rem]:grid-cols-2 items-end gap-3'
        }
      >
        {field('start')}
        {field('end')}
        {anyHidden ? (
          <Button
            type="button"
            variant="ghost"
            // Beside the fields when they fit; below the error when they wrap.
            className="@[34rem]:order-1 order-2 text-muted-foreground"
            aria-label={otherDayLabel}
            onClick={onShowDates}
          >
            {m.event_edit_preview_other_day()}
          </Button>
        ) : null}
        {anyHidden && error ? (
          <p
            id={errorId}
            className="@[34rem]:order-2 order-1 basis-full text-destructive text-xs"
          >
            {error}
          </p>
        ) : null}
      </div>
      {!anyHidden && error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface BlockRowProps {
  block: DraftBlock;
  position: number;
  timeZone: string;
  datesHidden: boolean;
  timeError: string | undefined;
  labelError: string | undefined;
  onShowDates: () => void;
  onPatch: (patch: Partial<DraftBlock>) => void;
  onRemove: () => void;
}

function BlockRow({
  block,
  position,
  timeZone,
  datesHidden,
  timeError,
  labelError,
  onShowDates,
  onPatch,
  onRemove,
}: BlockRowProps) {
  const touch = useFormControlSize() === 'touch';
  const labelErrorId = `event-edit-${block.key}-label-error`;
  return (
    <div
      className="surface-subtle space-y-3 p-3"
      data-testid="event-edit-block"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Input
            value={block.label}
            aria-label={m.event_edit_preview_block_label({ position })}
            aria-invalid={labelError ? true : undefined}
            aria-describedby={labelError ? labelErrorId : undefined}
            onChange={({ target }) => onPatch({ label: target.value })}
          />
          {block.id ? null : (
            <Button
              type="button"
              size={touch ? 'icon-touch' : 'icon'}
              variant="ghost"
              aria-label={m.event_edit_preview_block_remove({ position })}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
        {labelError ? (
          <p id={labelErrorId} className="text-destructive text-xs">
            {labelError}
          </p>
        ) : null}
      </div>
      <TimePair
        id={`event-edit-${block.key}`}
        testId={`event-edit-block-${position}`}
        startLabel={m.event_edit_preview_block_start_label({ position })}
        endLabel={m.event_edit_preview_block_end_label({ position })}
        start={block.start}
        end={block.end}
        timeZone={timeZone}
        startDateHidden={datesHidden}
        endDateHidden={datesHidden}
        error={timeError}
        otherDayLabel={m.event_edit_preview_other_day_block({ position })}
        onShowDates={onShowDates}
        onChange={onPatch}
      />
    </div>
  );
}
