import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { EventCancelDialog } from './event-cancel-dialog';
import { EventMovePreview } from './event-move-preview';
import type {
  CycleCalendarTableRow,
  CycleCalendarWeek,
} from './planning-admin.types';
import {
  canCancelEventTimeBlock,
  eventStatusBadgeVariant,
  eventStatusLabel,
  timeBlockCountLabel,
} from './planning-admin.utils';
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
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { DataTableColumn } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import {
  formatCalendarDateOnly,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';

/** Built per render so the headers follow the active locale. */
export function calendarTableColumns(): DataTableColumn[] {
  return [
    { id: 'event', name: m.cycle_review_column_event(), isRowHeader: true },
    { id: 'window', name: m.cycle_review_column_when() },
    { id: 'eventTimeBlocks', name: m.cycle_review_column_time_blocks() },
    { id: 'status', name: m.cycle_review_column_status() },
    { id: 'actions', name: m.cycle_review_column_actions() },
  ];
}

export type CalendarVisibleRow =
  | { kind: 'week'; weekStart: string; weekEnd: string }
  | { kind: 'parent'; row: CycleCalendarTableRow }
  | {
      kind: 'event-time-block';
      parentId: string;
      parentStatus: string;
      eventTimeBlockId: string;
      label: string;
      startTime: string;
      endTime: string;
      status: 'active' | 'cancelled';
      isOnlyEventTimeBlockInEvent: boolean;
    };

export interface BuildVisibleCalendarRowsInput {
  weeks: CycleCalendarWeek[];
  expandedEventIds: ReadonlySet<string>;
}

export function buildVisibleCalendarRows({
  weeks,
  expandedEventIds,
}: BuildVisibleCalendarRowsInput): CalendarVisibleRow[] {
  return weeks.flatMap(({ weekStart, weekEnd, rows }): CalendarVisibleRow[] => [
    { kind: 'week', weekStart, weekEnd },
    ...rows.flatMap((row): CalendarVisibleRow[] => {
      const parentRow: CalendarVisibleRow = { kind: 'parent', row };

      if (!expandedEventIds.has(row.eventId)) {
        return [parentRow];
      }

      return [
        parentRow,
        ...row.eventTimeBlocks.map(
          (eventTimeBlock): CalendarVisibleRow => ({
            kind: 'event-time-block',
            parentId: row.eventId,
            parentStatus: row.status,
            eventTimeBlockId: eventTimeBlock.eventTimeBlockId,
            label: eventTimeBlock.label,
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
            status: eventTimeBlock.status,
            isOnlyEventTimeBlockInEvent:
              eventTimeBlock.isOnlyEventTimeBlockInEvent,
          }),
        ),
      ];
    }),
  ]);
}

export interface VisibleRowIdInput {
  visibleRow: CalendarVisibleRow;
}

export function visibleRowId({ visibleRow }: VisibleRowIdInput): string {
  if (visibleRow.kind === 'week') return `week-${visibleRow.weekStart}`;

  return visibleRow.kind === 'parent'
    ? `event-${visibleRow.row.eventId}`
    : `event-time-block-${visibleRow.parentId}-${visibleRow.eventTimeBlockId}`;
}

export interface CalendarRowEventIdInput {
  visibleRow: CalendarVisibleRow;
}

export function calendarRowEventId({
  visibleRow,
}: CalendarRowEventIdInput): string {
  if (visibleRow.kind === 'week') return `week-${visibleRow.weekStart}`;

  return visibleRow.kind === 'parent'
    ? visibleRow.row.eventId
    : visibleRow.parentId;
}

export interface CalendarRowKeyInput {
  visibleRow: CalendarVisibleRow;
  isExpanded: boolean;
  isConfirmingDeleteEventTimeBlock: boolean;
  deleteEventTimeBlockPending: boolean;
}

/** `DataTable` keys and identifies each react-aria row by this wrapper's
 * `rowId` return value alone (it has no separate `TableBody` `dependencies`
 * passthrough). React Aria's row Collection memoizes a row's rendered
 * content by that id independent of the items array identity, so every prop
 * a cell actually displays — dialog/pending interaction state as well as the
 * row's own data — must be folded into the id, or state changes (an expand
 * toggle, a delete's pending flag, an edited title) silently fail to reach
 * the DOM. */
export function calendarRowKey({
  visibleRow,
  isExpanded,
  isConfirmingDeleteEventTimeBlock,
  deleteEventTimeBlockPending,
}: CalendarRowKeyInput): string {
  const id = visibleRowId({ visibleRow });
  const dataFingerprint =
    visibleRow.kind === 'week'
      ? visibleRow.weekEnd
      : visibleRow.kind === 'parent'
        ? `${visibleRow.row.title}-${visibleRow.row.location ?? ''}-${visibleRow.row.start}-${visibleRow.row.end}-${visibleRow.row.status}-${visibleRow.row.eventTimeBlocks.length}`
        : `${visibleRow.label}-${visibleRow.startTime}-${visibleRow.endTime}-${visibleRow.isOnlyEventTimeBlockInEvent}`;

  return `${id}-${dataFingerprint}-${isExpanded ? 'expanded' : 'collapsed'}-${isConfirmingDeleteEventTimeBlock ? 'deleting-event-time-block' : 'normal'}-${deleteEventTimeBlockPending ? 'event-time-block-pending' : 'event-time-block-idle'}`;
}

interface ConfirmDeleteDialogContentProps {
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onConfirm: () => void;
}

function ConfirmDeleteDialogContent({
  title,
  description,
  actionLabel,
  disabled,
  onConfirm,
}: ConfirmDeleteDialogContentProps) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={disabled}>
          {m.cycle_review_cancel()}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={disabled}
          onClick={onConfirm}
        >
          {actionLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

interface WeekLabelInput {
  weekStart: string;
  weekEnd: string;
}

/** `Week of 04/01/2027 – 10/01/2027` */
export function weekLabel({ weekStart, weekEnd }: WeekLabelInput): string {
  return m.cycle_review_week({
    start: formatCalendarDateOnly({ value: weekStart }),
    end: formatCalendarDateOnly({ value: weekEnd }),
  });
}

export interface ToggleEventExpandedInput {
  eventId: string;
}

export interface ConfirmDeleteEventTimeBlockOpenChangeInput {
  eventTimeBlockId: string;
  open: boolean;
}

export interface ConfirmDeleteEventTimeBlockInput {
  eventId: string;
  eventTimeBlockId: string;
}

export interface RenderCalendarCellInput {
  item: CalendarVisibleRow;
  column: DataTableColumn;
  /** The reviewed Cycle, for the nested Edit Event link. */
  cycleId: string;
  isExpanded: boolean;
  isReadOnly: boolean;
  canPreviewMove?: boolean;
  /** A future scheduled Event of a Sent Cycle can be cancelled. */
  canCancel?: boolean;
  /** The Event's blocks can be cancelled (Sent Cycle, scheduled Event). */
  canCancelBlocks?: boolean;
  isConfirmingDeleteEventTimeBlock: boolean;
  deleteEventTimeBlockPending: boolean;
  timeZone: string;
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
  onDeleteEventTimeBlockOpenChange: (
    input: ConfirmDeleteEventTimeBlockOpenChangeInput,
  ) => void;
  onDeleteEventTimeBlockConfirm: (
    input: ConfirmDeleteEventTimeBlockInput,
  ) => void;
}

/** Cell content for one calendar `DataTable` row: either a day/event parent
 * row or (when its parent is expanded) one of its time block rows. `DataTable`
 * owns the `TableRow`/`TableCell` wrapper; this only renders what goes
 * inside a given column's cell. */
export function renderCalendarCell({
  item,
  column,
  cycleId,
  isExpanded,
  isReadOnly,
  canPreviewMove = false,
  canCancel = false,
  canCancelBlocks = false,
  isConfirmingDeleteEventTimeBlock,
  deleteEventTimeBlockPending,
  timeZone,
  onToggleExpand,
  onDeleteEventTimeBlockOpenChange,
  onDeleteEventTimeBlockConfirm,
}: RenderCalendarCellInput) {
  if (item.kind === 'week') {
    return column.id === 'event' ? (
      <span className="font-semibold">{weekLabel(item)}</span>
    ) : null;
  }

  return item.kind === 'parent' ? (
    <ParentRowCell
      column={column}
      row={item.row}
      cycleId={cycleId}
      isExpanded={isExpanded}
      isReadOnly={isReadOnly}
      canPreviewMove={canPreviewMove}
      canCancel={canCancel}
      timeZone={timeZone}
      onToggleExpand={onToggleExpand}
    />
  ) : (
    <EventTimeBlockRowCell
      column={column}
      visibleRow={item}
      cycleId={cycleId}
      canPreviewMove={canPreviewMove}
      canCancelBlock={canCancelEventTimeBlock({
        eventAllows: canCancelBlocks,
        status: item.status,
        start: item.startTime,
      })}
      isReadOnly={isReadOnly}
      isConfirmingDelete={isConfirmingDeleteEventTimeBlock}
      deletePending={deleteEventTimeBlockPending}
      timeZone={timeZone}
      onDeleteOpenChange={onDeleteEventTimeBlockOpenChange}
      onDeleteConfirm={onDeleteEventTimeBlockConfirm}
    />
  );
}

interface ParentRowCellProps {
  column: DataTableColumn;
  row: CycleCalendarTableRow;
  cycleId: string;
  isExpanded: boolean;
  isReadOnly: boolean;
  canPreviewMove: boolean;
  canCancel: boolean;
  timeZone: string;
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
}

function ParentRowCell({
  column,
  row,
  cycleId,
  isExpanded,
  isReadOnly,
  canPreviewMove,
  canCancel,
  timeZone,
  onToggleExpand,
}: ParentRowCellProps) {
  return (
    <>
      {column.id === 'event' ? (
        <span className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={
              isExpanded
                ? m.cycle_review_collapse_event({ title: row.title })
                : m.cycle_review_expand_event({ title: row.title })
            }
            onClick={() => onToggleExpand({ eventId: row.eventId })}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          <span className="flex flex-col">
            <span
              className={
                row.status === 'cancelled'
                  ? 'text-muted-foreground line-through'
                  : undefined
              }
            >
              {row.title}
            </span>
            {row.location ? (
              <span className="font-normal text-muted-foreground text-xs">
                {m.cycle_review_location({ location: row.location })}
              </span>
            ) : null}
          </span>
        </span>
      ) : null}
      {column.id === 'window'
        ? formatInstantRangeOf({ start: row.start, end: row.end, timeZone })
        : null}
      {column.id === 'eventTimeBlocks'
        ? timeBlockCountLabel({ count: row.eventTimeBlocks.length })
        : null}
      {column.id === 'status' ? (
        <Badge variant={eventStatusBadgeVariant({ status: row.status })}>
          {eventStatusLabel({ status: row.status })}
        </Badge>
      ) : null}
      {column.id === 'actions' && !isReadOnly ? (
        <span className="flex items-center gap-1">
          <Link
            to="/cycles/$cycleId/events/$eventId"
            params={{ cycleId, eventId: row.eventId }}
            className={buttonVariants({ size: 'icon-xs', variant: 'ghost' })}
            aria-label={m.cycle_review_edit_day({ title: row.title })}
          >
            <Pencil className="size-3.5" />
          </Link>
        </span>
      ) : null}
      {column.id === 'actions' && canPreviewMove ? (
        <EventMovePreview
          cycleId={cycleId}
          eventId={row.eventId}
          title={row.title}
          start={row.start as Instant}
          size="icon-xs"
        />
      ) : null}
      {column.id === 'actions' && canCancel ? (
        <EventCancelDialog
          cycleId={cycleId}
          eventId={row.eventId}
          title={row.title}
          size="icon-xs"
        />
      ) : null}
    </>
  );
}

interface EventTimeBlockRowCellProps {
  column: DataTableColumn;
  visibleRow: Extract<CalendarVisibleRow, { kind: 'event-time-block' }>;
  cycleId: string;
  canPreviewMove: boolean;
  canCancelBlock: boolean;
  isReadOnly: boolean;
  isConfirmingDelete: boolean;
  deletePending: boolean;
  timeZone: string;
  onDeleteOpenChange: (
    input: ConfirmDeleteEventTimeBlockOpenChangeInput,
  ) => void;
  onDeleteConfirm: (input: ConfirmDeleteEventTimeBlockInput) => void;
}

function EventTimeBlockRowCell({
  column,
  visibleRow,
  cycleId,
  canPreviewMove,
  canCancelBlock,
  isReadOnly,
  isConfirmingDelete,
  deletePending,
  timeZone,
  onDeleteOpenChange,
  onDeleteConfirm,
}: EventTimeBlockRowCellProps) {
  return (
    <>
      {column.id === 'event' ? (
        <span
          className={cn(
            'pl-8 text-muted-foreground',
            visibleRow.status === 'cancelled' && 'line-through',
          )}
        >
          {visibleRow.label}
        </span>
      ) : null}
      {column.id === 'window' ? (
        <span className="text-muted-foreground">
          {formatInstantRangeOf({
            start: visibleRow.startTime,
            end: visibleRow.endTime,
            timeZone,
          })}
        </span>
      ) : null}
      {column.id === 'actions' && canPreviewMove ? (
        <EventMovePreview
          cycleId={cycleId}
          eventId={visibleRow.parentId}
          eventTimeBlockId={visibleRow.eventTimeBlockId}
          title={visibleRow.label}
          start={visibleRow.startTime as Instant}
          size="icon-xs"
        />
      ) : null}
      {column.id === 'actions' && canCancelBlock ? (
        <EventCancelDialog
          cycleId={cycleId}
          eventId={visibleRow.parentId}
          eventTimeBlockId={visibleRow.eventTimeBlockId}
          title={visibleRow.label}
          size="icon-xs"
        />
      ) : null}
      {column.id === 'actions' &&
      !isReadOnly &&
      visibleRow.status === 'active' ? (
        <span className="flex items-center gap-1">
          {visibleRow.isOnlyEventTimeBlockInEvent ? (
            <Button
              type="button"
              size="icon-xs"
              variant="destructive"
              disabled
              aria-label={m.cycle_review_delete_time_block({
                label: visibleRow.label,
              })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : (
            <AlertDialog
              open={isConfirmingDelete}
              onOpenChange={(open) =>
                onDeleteOpenChange({
                  eventTimeBlockId: visibleRow.eventTimeBlockId,
                  open,
                })
              }
            >
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    aria-label={m.cycle_review_delete_time_block({
                      label: visibleRow.label,
                    })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <ConfirmDeleteDialogContent
                title={m.cycle_review_delete_time_block_title()}
                description={m.cycle_review_delete_time_block_description({
                  label: visibleRow.label,
                })}
                actionLabel={
                  deletePending
                    ? m.cycle_review_deleting()
                    : m.cycle_review_delete_time_block_confirm()
                }
                disabled={deletePending}
                onConfirm={() =>
                  onDeleteConfirm({
                    eventId: visibleRow.parentId,
                    eventTimeBlockId: visibleRow.eventTimeBlockId,
                  })
                }
              />
            </AlertDialog>
          )}
        </span>
      ) : null}
    </>
  );
}
