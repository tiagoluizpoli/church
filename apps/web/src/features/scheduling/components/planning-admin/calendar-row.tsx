import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CycleCalendarTableRow } from './planning-admin.types';
import { eventStatusBadgeVariant } from './planning-admin.utils';
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
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import type { useTimezone } from '@/shared/hooks/use-timezone';

export const CALENDAR_TABLE_COLUMNS = [
  { id: 'event', name: 'Event' },
  { id: 'window', name: 'Date / Time' },
  { id: 'slots', name: 'Slots' },
  { id: 'status', name: 'Status' },
  { id: 'actions', name: 'Actions' },
] as const;

export type CalendarVisibleRow =
  | { kind: 'parent'; row: CycleCalendarTableRow }
  | {
      kind: 'slot';
      parentId: string;
      slotId: string;
      label: string;
      startTime: string;
      endTime: string;
      isOnlySlotInEvent: boolean;
    };

export interface BuildVisibleCalendarRowsInput {
  rows: CycleCalendarTableRow[];
  expandedEventIds: ReadonlySet<string>;
}

export function buildVisibleCalendarRows({
  rows,
  expandedEventIds,
}: BuildVisibleCalendarRowsInput): CalendarVisibleRow[] {
  return rows.flatMap((row): CalendarVisibleRow[] => {
    const parentRow: CalendarVisibleRow = { kind: 'parent', row };

    if (!expandedEventIds.has(row.eventId)) {
      return [parentRow];
    }

    return [
      parentRow,
      ...row.slots.map(
        (slot): CalendarVisibleRow => ({
          kind: 'slot',
          parentId: row.eventId,
          slotId: slot.slotId,
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isOnlySlotInEvent: slot.isOnlySlotInEvent,
        }),
      ),
    ];
  });
}

export interface VisibleRowIdInput {
  visibleRow: CalendarVisibleRow;
}

export function visibleRowId({ visibleRow }: VisibleRowIdInput): string {
  return visibleRow.kind === 'parent'
    ? `event-${visibleRow.row.eventId}`
    : `slot-${visibleRow.parentId}-${visibleRow.slotId}`;
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
        <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
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

export interface ToggleEventExpandedInput {
  eventId: string;
}

export interface StartEditEventInput {
  row: CycleCalendarTableRow;
}

export interface StartCreateSlotInput {
  row: CycleCalendarTableRow;
}

export interface StartEditSlotInput {
  parentId: string;
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
}

export interface ConfirmDeleteEventOpenChangeInput {
  eventId: string;
  open: boolean;
}

export interface ConfirmDeleteEventInput {
  eventId: string;
}

export interface ConfirmDeleteSlotOpenChangeInput {
  slotId: string;
  open: boolean;
}

export interface ConfirmDeleteSlotInput {
  eventId: string;
  slotId: string;
}

export interface CalendarRowProps {
  visibleRow: CalendarVisibleRow;
  isExpanded: boolean;
  isReadOnly: boolean;
  isConfirmingDeleteEvent: boolean;
  isConfirmingDeleteSlot: boolean;
  deleteEventPending: boolean;
  deleteSlotPending: boolean;
  format: ReturnType<typeof useTimezone>['format'];
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
  onAddSlotRequest: (input: StartCreateSlotInput) => void;
  onEditEventRequest: (input: StartEditEventInput) => void;
  onDeleteEventOpenChange: (input: ConfirmDeleteEventOpenChangeInput) => void;
  onDeleteEventConfirm: (input: ConfirmDeleteEventInput) => void;
  onEditSlotRequest: (input: StartEditSlotInput) => void;
  onDeleteSlotOpenChange: (input: ConfirmDeleteSlotOpenChangeInput) => void;
  onDeleteSlotConfirm: (input: ConfirmDeleteSlotInput) => void;
}

/** One calendar row: either a day/event parent row or (when its parent is
 * expanded) one of its slot rows. Split out of `CycleReviewCard` so the
 * per-column render logic for both row kinds lives in one place. Must stay a
 * `<TableRow columns={...}>{(column) => ...}</TableRow>` — react-aria's
 * dynamic-column `Collection` model (see `ui/table.tsx`) requires the
 * per-column render prop, a plain `.map()` over cells won't register
 * correctly with the table's collection. That same Collection model also
 * memoizes a row's rendered content independent of the `TableBody`
 * `dependencies` array once built, so `rowKey` folds in every prop that must
 * force a fresh render (dialog open state, delete-pending state) — without
 * it, e.g. a delete mutation's pending flag flips in React state but never
 * reaches the DOM. */
export function CalendarRow({
  visibleRow,
  isExpanded,
  isReadOnly,
  isConfirmingDeleteEvent,
  isConfirmingDeleteSlot,
  deleteEventPending,
  deleteSlotPending,
  format,
  onToggleExpand,
  onAddSlotRequest,
  onEditEventRequest,
  onDeleteEventOpenChange,
  onDeleteEventConfirm,
  onEditSlotRequest,
  onDeleteSlotOpenChange,
  onDeleteSlotConfirm,
}: CalendarRowProps) {
  const id = visibleRowId({ visibleRow });
  const rowKey = `${id}-${isExpanded ? 'expanded' : 'collapsed'}-${isConfirmingDeleteEvent ? 'deleting' : 'normal'}-${isConfirmingDeleteSlot ? 'deleting-slot' : 'normal'}-${deleteEventPending ? 'event-pending' : 'event-idle'}-${deleteSlotPending ? 'slot-pending' : 'slot-idle'}`;

  return (
    <TableRow key={rowKey} id={rowKey} columns={CALENDAR_TABLE_COLUMNS}>
      {(column) => (
        <TableCell>
          {visibleRow.kind === 'parent' ? (
            <ParentRowCell
              column={column}
              row={visibleRow.row}
              isExpanded={isExpanded}
              isReadOnly={isReadOnly}
              isConfirmingDelete={isConfirmingDeleteEvent}
              deletePending={deleteEventPending}
              format={format}
              onToggleExpand={onToggleExpand}
              onAddSlotRequest={onAddSlotRequest}
              onEditEventRequest={onEditEventRequest}
              onDeleteOpenChange={onDeleteEventOpenChange}
              onDeleteConfirm={onDeleteEventConfirm}
            />
          ) : (
            <SlotRowCell
              column={column}
              visibleRow={visibleRow}
              isReadOnly={isReadOnly}
              isConfirmingDelete={isConfirmingDeleteSlot}
              deletePending={deleteSlotPending}
              format={format}
              onEditSlotRequest={onEditSlotRequest}
              onDeleteOpenChange={onDeleteSlotOpenChange}
              onDeleteConfirm={onDeleteSlotConfirm}
            />
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

type CalendarTableColumn = (typeof CALENDAR_TABLE_COLUMNS)[number];

interface ParentRowCellProps {
  column: CalendarTableColumn;
  row: CycleCalendarTableRow;
  isExpanded: boolean;
  isReadOnly: boolean;
  isConfirmingDelete: boolean;
  deletePending: boolean;
  format: ReturnType<typeof useTimezone>['format'];
  onToggleExpand: (input: ToggleEventExpandedInput) => void;
  onAddSlotRequest: (input: StartCreateSlotInput) => void;
  onEditEventRequest: (input: StartEditEventInput) => void;
  onDeleteOpenChange: (input: ConfirmDeleteEventOpenChangeInput) => void;
  onDeleteConfirm: (input: ConfirmDeleteEventInput) => void;
}

function ParentRowCell({
  column,
  row,
  isExpanded,
  isReadOnly,
  isConfirmingDelete,
  deletePending,
  format,
  onToggleExpand,
  onAddSlotRequest,
  onEditEventRequest,
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
              isExpanded ? `Collapse ${row.title}` : `Expand ${row.title}`
            }
            onClick={() => onToggleExpand({ eventId: row.eventId })}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          {row.title}
        </span>
      ) : null}
      {column.id === 'window' ? format(row.startDate, 'PP') : null}
      {column.id === 'slots'
        ? `${row.slots.length} slot${row.slots.length === 1 ? '' : 's'}`
        : null}
      {column.id === 'status' ? (
        <Badge variant={eventStatusBadgeVariant({ status: row.status })}>
          {row.status}
        </Badge>
      ) : null}
      {column.id === 'actions' && !isReadOnly ? (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Add slot to ${row.title}`}
            onClick={() => onAddSlotRequest({ row })}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Edit day ${row.title}`}
            onClick={() => onEditEventRequest({ row })}
          >
            <Pencil className="size-3.5" />
          </Button>
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
                  aria-label={`Delete day ${row.title}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
            />
            <ConfirmDeleteDialogContent
              title="Delete this day?"
              description={`This removes "${row.title}" and its slots from the cycle.`}
              actionLabel={deletePending ? 'Deleting…' : 'Delete event'}
              disabled={deletePending}
              onConfirm={() => onDeleteConfirm({ eventId: row.eventId })}
            />
          </AlertDialog>
        </span>
      ) : null}
    </>
  );
}

interface SlotRowCellProps {
  column: CalendarTableColumn;
  visibleRow: Extract<CalendarVisibleRow, { kind: 'slot' }>;
  isReadOnly: boolean;
  isConfirmingDelete: boolean;
  deletePending: boolean;
  format: ReturnType<typeof useTimezone>['format'];
  onEditSlotRequest: (input: StartEditSlotInput) => void;
  onDeleteOpenChange: (input: ConfirmDeleteSlotOpenChangeInput) => void;
  onDeleteConfirm: (input: ConfirmDeleteSlotInput) => void;
}

function SlotRowCell({
  column,
  visibleRow,
  isReadOnly,
  isConfirmingDelete,
  deletePending,
  format,
  onEditSlotRequest,
  onDeleteOpenChange,
  onDeleteConfirm,
}: SlotRowCellProps) {
  return (
    <>
      {column.id === 'event' ? (
        <span className="pl-8 text-muted-foreground">{visibleRow.label}</span>
      ) : null}
      {column.id === 'window' ? (
        <span className="text-muted-foreground">
          {format(visibleRow.startTime, 'p')} –{' '}
          {format(visibleRow.endTime, 'p')}
        </span>
      ) : null}
      {column.id === 'actions' && !isReadOnly ? (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Edit slot ${visibleRow.label}`}
            onClick={() =>
              onEditSlotRequest({
                parentId: visibleRow.parentId,
                slotId: visibleRow.slotId,
                label: visibleRow.label,
                startTime: visibleRow.startTime,
                endTime: visibleRow.endTime,
              })
            }
          >
            <Pencil className="size-3.5" />
          </Button>
          {visibleRow.isOnlySlotInEvent ? (
            <Button
              type="button"
              size="icon-xs"
              variant="destructive"
              disabled
              aria-label={`Delete slot ${visibleRow.label}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : (
            <AlertDialog
              open={isConfirmingDelete}
              onOpenChange={(open) =>
                onDeleteOpenChange({ slotId: visibleRow.slotId, open })
              }
            >
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    aria-label={`Delete slot ${visibleRow.label}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <ConfirmDeleteDialogContent
                title="Delete this slot?"
                description={`This removes "${visibleRow.label}" from the day.`}
                actionLabel={deletePending ? 'Deleting…' : 'Delete slot'}
                disabled={deletePending}
                onConfirm={() =>
                  onDeleteConfirm({
                    eventId: visibleRow.parentId,
                    slotId: visibleRow.slotId,
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
