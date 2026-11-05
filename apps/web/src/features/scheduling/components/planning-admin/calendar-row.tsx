import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type {
  CycleCalendarTableRow,
  CycleCalendarWeek,
} from './planning-admin.types';
import {
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
      eventTimeBlockId: string;
      label: string;
      startTime: string;
      endTime: string;
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
            eventTimeBlockId: eventTimeBlock.eventTimeBlockId,
            label: eventTimeBlock.label,
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
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
  isConfirmingDeleteEvent: boolean;
  isConfirmingDeleteEventTimeBlock: boolean;
  deleteEventPending: boolean;
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
  isConfirmingDeleteEvent,
  isConfirmingDeleteEventTimeBlock,
  deleteEventPending,
  deleteEventTimeBlockPending,
}: CalendarRowKeyInput): string {
  const id = visibleRowId({ visibleRow });
  const dataFingerprint =
    visibleRow.kind === 'week'
      ? visibleRow.weekEnd
      : visibleRow.kind === 'parent'
        ? `${visibleRow.row.title}-${visibleRow.row.location ?? ''}-${visibleRow.row.start}-${visibleRow.row.end}-${visibleRow.row.status}-${visibleRow.row.eventTimeBlocks.length}`
        : `${visibleRow.label}-${visibleRow.startTime}-${visibleRow.endTime}-${visibleRow.isOnlyEventTimeBlockInEvent}`;

  return `${id}-${dataFingerprint}-${isExpanded ? 'expanded' : 'collapsed'}-${isConfirmingDeleteEvent ? 'deleting' : 'normal'}-${isConfirmingDeleteEventTimeBlock ? 'deleting-event-time-block' : 'normal'}-${deleteEventPending ? 'event-pending' : 'event-idle'}-${deleteEventTimeBlockPending ? 'event-time-block-pending' : 'event-time-block-idle'}`;
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

export interface ConfirmDeleteEventOpenChangeInput {
  eventId: string;
  open: boolean;
}

export interface ConfirmDeleteEventInput {
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
  isConfirmingDeleteEvent: boolean;
  isConfirmingDeleteEventTimeBlock: boolean;
  deleteEventPending: boolean;
  deleteEventTimeBlockPending: boolean;
  timeZone: string;
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
  onDeleteEventOpenChange: (input: ConfirmDeleteEventOpenChangeInput) => void;
  onDeleteEventConfirm: (input: ConfirmDeleteEventInput) => void;
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
  isConfirmingDeleteEvent,
  isConfirmingDeleteEventTimeBlock,
  deleteEventPending,
  deleteEventTimeBlockPending,
  timeZone,
  onToggleExpand,
  onDeleteEventOpenChange,
  onDeleteEventConfirm,
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
      isConfirmingDelete={isConfirmingDeleteEvent}
      deletePending={deleteEventPending}
      timeZone={timeZone}
      onToggleExpand={onToggleExpand}
      onDeleteOpenChange={onDeleteEventOpenChange}
      onDeleteConfirm={onDeleteEventConfirm}
    />
  ) : (
    <EventTimeBlockRowCell
      column={column}
      visibleRow={item}
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
  isConfirmingDelete: boolean;
  deletePending: boolean;
  timeZone: string;
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
  onDeleteOpenChange: (input: ConfirmDeleteEventOpenChangeInput) => void;
  onDeleteConfirm: (input: ConfirmDeleteEventInput) => void;
}

function ParentRowCell({
  column,
  row,
  cycleId,
  isExpanded,
  isReadOnly,
  isConfirmingDelete,
  deletePending,
  timeZone,
  onToggleExpand,
  onDeleteOpenChange,
  onDeleteConfirm,
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
            {row.title}
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
          <AlertDialog
            open={isConfirmingDelete}
            onOpenChange={(open) =>
              onDeleteOpenChange({ eventId: row.eventId, open })
            }
          >
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="destructive"
                  aria-label={m.cycle_review_delete_day({ title: row.title })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
            />
            <ConfirmDeleteDialogContent
              title={m.cycle_review_delete_day_title()}
              description={m.cycle_review_delete_day_description({
                title: row.title,
              })}
              actionLabel={
                deletePending
                  ? m.cycle_review_deleting()
                  : m.cycle_review_delete_event_confirm()
              }
              disabled={deletePending}
              onConfirm={() => onDeleteConfirm({ eventId: row.eventId })}
            />
          </AlertDialog>
        </span>
      ) : null}
    </>
  );
}

interface EventTimeBlockRowCellProps {
  column: DataTableColumn;
  visibleRow: Extract<CalendarVisibleRow, { kind: 'event-time-block' }>;
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
        <span className="pl-8 text-muted-foreground">{visibleRow.label}</span>
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
      {column.id === 'actions' && !isReadOnly ? (
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
