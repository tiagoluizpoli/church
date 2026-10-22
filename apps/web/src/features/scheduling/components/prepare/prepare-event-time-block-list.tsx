import {
  type CalendarDay,
  compareCalendarDays,
  compareInstants,
  formatCalendarDay,
  parseInstant,
} from '@church/time';
import { useForm } from '@tanstack/react-form';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import z from 'zod';
import {
  formatTimeRange,
  getEventTimeBlockHeadcountRows,
  type HeadcountRow,
  participationStateLabel,
  type SplitFormState,
  toHeadcountKey,
} from '../participation-prepare.utils';
import { ManualSplitEditor } from './manual-split-editor';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FormControlSizeProvider,
  useFormControlSize,
} from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMediaQuery } from '@/hooks/use-media-query';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
  GetScheduleBuilderData200RolesItem,
  GetScheduleBuilderData200SectorsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

export interface HeadcountSave {
  sectorId: string;
  roleId: string;
  peopleNeeded: number;
}

export interface HeadcountSavesForShift {
  shiftId: string;
  validHeadcounts: HeadcountSave[];
}

type RoleCatalogStatus = 'loading' | 'error' | 'ready';

const headcountValueSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Enter a whole number of people needed, at least 1.');

export interface PrepareEventTimeBlockListProps {
  events: GetCycleParticipation200EventsItem[];
  ministryId: string;
  splitForms: Record<string, SplitFormState>;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  splitDirtyEventTimeBlockIds: Set<string>;
  headcountDirtyEventTimeBlockIds: Set<string>;
  pendingHeadcountEventTimeBlockId: string | null;
  pendingSplitEventTimeBlockId: string | null;
  pendingInclusionEventTimeBlockId: string | null;
  onToggleInclusion: (input: {
    participationId: string;
    eventTimeBlockId: string;
    checked: boolean;
  }) => void;
  onSplitFormChange: (input: {
    eventTimeBlockId: string;
    nextForm: SplitFormState;
  }) => void;
  onSplitShifts: (input: {
    participationId: string;
    eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  }) => void;
  onHeadcountChange: (input: {
    shiftId: string;
    sectorId: string;
    roleId: string;
    value: string;
  }) => void;
  onSaveHeadcounts: (input: {
    participationId: string;
    eventTimeBlockId: string;
    headcountSavesByShift: HeadcountSavesForShift[];
  }) => void;
}

interface FlatEventTimeBlockRow {
  dayKey: CalendarDay;
  eventView: GetCycleParticipation200EventsItem;
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
}

export interface BuildFlatDayGroupsInput {
  events: GetCycleParticipation200EventsItem[];
  timeZone: string;
}

function buildFlatDayGroups({
  events,
  timeZone,
}: BuildFlatDayGroupsInput): Map<CalendarDay, FlatEventTimeBlockRow[]> {
  const rows: FlatEventTimeBlockRow[] = [];

  for (const eventView of events) {
    for (const eventTimeBlockView of eventView.eventTimeBlocks) {
      rows.push({
        dayKey: dayOf({
          value: eventTimeBlockView.eventTimeBlock.startTime,
          timeZone,
        }),
        eventView,
        eventTimeBlockView,
      });
    }
  }

  rows.sort((left, right) =>
    compareInstants({
      left: parseInstant({
        value: left.eventTimeBlockView.eventTimeBlock.startTime,
      }),
      right: parseInstant({
        value: right.eventTimeBlockView.eventTimeBlock.startTime,
      }),
    }),
  );

  const groups = new Map<CalendarDay, FlatEventTimeBlockRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.dayKey);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.dayKey, [row]);
    }
  }

  return groups;
}

interface ParseValidHeadcountsInput {
  shiftId: string;
  headcountRows: HeadcountRow[];
  headcountDrafts: Record<string, string>;
}

function parseValidHeadcounts({
  shiftId,
  headcountRows,
  headcountDrafts,
}: ParseValidHeadcountsInput): HeadcountSave[] {
  return headcountRows.reduce<HeadcountSave[]>((valid, row) => {
    const raw =
      headcountDrafts[
        toHeadcountKey({ shiftId, sectorId: row.sectorId, roleId: row.roleId })
      ] ?? '';
    if (!headcountValueSchema.safeParse(raw.trim()).success) {
      return valid;
    }

    valid.push({
      sectorId: row.sectorId,
      roleId: row.roleId,
      peopleNeeded: Number.parseInt(raw, 10),
    });
    return valid;
  }, []);
}

interface HeadcountInputProps {
  /** Unique per Shift × Sector × Role; names the input's id and test id. */
  inputKey: string;
  value: string;
  onValueChange: (value: string) => void;
}

function HeadcountInput({
  inputKey,
  value,
  onValueChange,
}: HeadcountInputProps) {
  const form = useForm({
    defaultValues: { value },
    validators: { onChange: z.object({ value: headcountValueSchema }) },
  });

  useEffect(() => {
    form.setFieldValue('value', value);
  }, [form, value]);

  return (
    <form.Field name="value">
      {(field) => (
        <Input
          id={`headcount-${inputKey}`}
          data-testid={`headcount-input-${inputKey}`}
          type="number"
          min="1"
          step="1"
          placeholder="0"
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(event) => {
            field.handleChange(event.target.value);
            onValueChange(event.target.value);
          }}
        />
      )}
    </form.Field>
  );
}

function summarizeEventTimeBlock(
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem,
): string {
  if (eventTimeBlockView.shifts.length === 0)
    return 'Not split into shifts yet';

  const shiftLabel =
    eventTimeBlockView.shifts.length === 1 ? 'shift' : 'shifts';
  const totalHeadcount = eventTimeBlockView.requirements.reduce(
    (sum, requirement) => sum + requirement.peopleNeeded,
    0,
  );
  if (totalHeadcount === 0) {
    return `${eventTimeBlockView.shifts.length} ${shiftLabel} · no people needed set yet`;
  }

  return `${eventTimeBlockView.shifts.length} ${shiftLabel} · ${totalHeadcount} people needed`;
}

interface SetEventTimeBlockExpandedInput {
  eventTimeBlockId: string;
  expanded: boolean;
}

/** Flat, day-grouped time block list — fully supersedes `ParticipationEventCard`'s
 * old nested-card rendering role (research.md R2): a day header row, then
 * inset event/time block rows, no card-in-card. Inclusion checkbox persists
 * immediately via `setParticipationInclusions` (T026); shift-split and
 * headcount editing wire the existing `splitParticipationShifts` and
 * headcount-upsert mutations unchanged (T027). */
export function PrepareEventTimeBlockList({
  events,
  ministryId,
  splitForms,
  headcountDrafts,
  savedHeadcountDrafts,
  splitDirtyEventTimeBlockIds,
  headcountDirtyEventTimeBlockIds,
  pendingHeadcountEventTimeBlockId,
  pendingSplitEventTimeBlockId,
  pendingInclusionEventTimeBlockId,
  onToggleInclusion,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
}: PrepareEventTimeBlockListProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { churchTimezone } = useTimezone();
  const uniqueEventIds = [...new Set(events.map((e) => e.event.id))];

  /** Collapsed by default (T-layout: wall-of-forms fix) — a time block only
   * expands when the leader explicitly opens it, or the instant they check
   * it in for the first time this session, since that's exactly when they
   * mean to configure its split/headcount next. */
  const [expandedEventTimeBlockIds, setExpandedEventTimeBlockIds] = useState<
    Set<string>
  >(new Set());
  const setEventTimeBlockExpanded = ({
    eventTimeBlockId,
    expanded,
  }: SetEventTimeBlockExpandedInput) =>
    setExpandedEventTimeBlockIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(eventTimeBlockId);
      } else {
        next.delete(eventTimeBlockId);
      }
      return next;
    });

  const roleQueries = useQueries({
    queries: uniqueEventIds.map((eventId) => ({
      queryKey: ['prepare-role-catalog', eventId, ministryId],
      queryFn: () => adminApi.getScheduleBuilderData({ eventId, ministryId }),
      retry: false,
    })),
  });

  const rolesByEventId: Record<string, GetScheduleBuilderData200RolesItem[]> =
    {};
  const sectorsByEventId: Record<
    string,
    GetScheduleBuilderData200SectorsItem[]
  > = {};
  const roleCatalogStatusByEventId: Record<string, RoleCatalogStatus> = {};
  const retryRoleCatalogByEventId: Record<string, () => void> = {};
  uniqueEventIds.forEach((eventId, index) => {
    const query = roleQueries[index];
    rolesByEventId[eventId] = query?.data?.roles ?? [];
    sectorsByEventId[eventId] = query?.data?.sectors ?? [];
    roleCatalogStatusByEventId[eventId] = query?.isError
      ? 'error'
      : query?.isLoading
        ? 'loading'
        : 'ready';
    retryRoleCatalogByEventId[eventId] = () => query?.refetch();
  });

  const dayGroups = buildFlatDayGroups({ events, timeZone: churchTimezone });
  const sortedDayKeys = [...dayGroups.keys()].sort((left, right) =>
    compareCalendarDays({ left, right }),
  );

  if (sortedDayKeys.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="prepare-event-time-block-list-empty-state"
      >
        No time blocks match your filters. Try a different day, name, or time
        range.
      </p>
    );
  }

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <div className="space-y-4" data-testid="prepare-event-time-block-list">
        <div
          className="hidden border-border/60 border-b pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide lg:grid lg:grid-cols-[24px_minmax(0,1fr)_170px_130px_28px] lg:gap-4"
          data-testid="prepare-event-time-block-list-column-header"
        >
          <span aria-hidden="true" />
          <span>Time block</span>
          <span>Time</span>
          <span>Cycle status</span>
          <span aria-hidden="true" />
        </div>
        {sortedDayKeys.map((dayKey) => {
          const rows = dayGroups.get(dayKey) ?? [];
          return (
            <div key={dayKey} className="space-y-2">
              <div
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                data-testid={`prepare-day-header-${dayKey}`}
              >
                {formatCalendarDay({ day: dayKey })}
              </div>

              <div className="space-y-2">
                {rows.map(({ eventView, eventTimeBlockView }) => (
                  <EventTimeBlockRow
                    key={eventTimeBlockView.eventTimeBlock.id}
                    eventView={eventView}
                    eventTimeBlockView={eventTimeBlockView}
                    ministryId={ministryId}
                    headcountRows={getEventTimeBlockHeadcountRows({
                      sectors: sectorsByEventId[eventView.event.id] ?? [],
                      roles: rolesByEventId[eventView.event.id] ?? [],
                      eventTimeBlockView,
                    })}
                    hasSectors={
                      (sectorsByEventId[eventView.event.id] ?? []).length > 0
                    }
                    roleCatalogStatus={
                      roleCatalogStatusByEventId[eventView.event.id] ?? 'ready'
                    }
                    onRetryRoleCatalog={
                      retryRoleCatalogByEventId[eventView.event.id]
                    }
                    splitForm={splitForms[eventTimeBlockView.eventTimeBlock.id]}
                    headcountDrafts={headcountDrafts}
                    savedHeadcountDrafts={savedHeadcountDrafts}
                    isSplitDirty={splitDirtyEventTimeBlockIds.has(
                      eventTimeBlockView.eventTimeBlock.id,
                    )}
                    isHeadcountDirty={headcountDirtyEventTimeBlockIds.has(
                      eventTimeBlockView.eventTimeBlock.id,
                    )}
                    pendingHeadcountEventTimeBlockId={
                      pendingHeadcountEventTimeBlockId
                    }
                    pendingSplitEventTimeBlockId={pendingSplitEventTimeBlockId}
                    pendingInclusionEventTimeBlockId={
                      pendingInclusionEventTimeBlockId
                    }
                    expanded={expandedEventTimeBlockIds.has(
                      eventTimeBlockView.eventTimeBlock.id,
                    )}
                    onToggleExpanded={() =>
                      setEventTimeBlockExpanded({
                        eventTimeBlockId: eventTimeBlockView.eventTimeBlock.id,
                        expanded: !expandedEventTimeBlockIds.has(
                          eventTimeBlockView.eventTimeBlock.id,
                        ),
                      })
                    }
                    onToggleInclusion={(input) => {
                      if (input.checked) {
                        setEventTimeBlockExpanded({
                          eventTimeBlockId: input.eventTimeBlockId,
                          expanded: true,
                        });
                      }
                      onToggleInclusion(input);
                    }}
                    onSplitFormChange={onSplitFormChange}
                    onSplitShifts={onSplitShifts}
                    onHeadcountChange={onHeadcountChange}
                    onSaveHeadcounts={onSaveHeadcounts}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FormControlSizeProvider>
  );
}

interface EventTimeBlockRowProps {
  eventView: GetCycleParticipation200EventsItem;
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  ministryId: string;
  headcountRows: HeadcountRow[];
  hasSectors: boolean;
  roleCatalogStatus: RoleCatalogStatus;
  onRetryRoleCatalog: (() => void) | undefined;
  splitForm: SplitFormState | undefined;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  isSplitDirty: boolean;
  isHeadcountDirty: boolean;
  pendingHeadcountEventTimeBlockId: string | null;
  pendingSplitEventTimeBlockId: string | null;
  pendingInclusionEventTimeBlockId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleInclusion: PrepareEventTimeBlockListProps['onToggleInclusion'];
  onSplitFormChange: PrepareEventTimeBlockListProps['onSplitFormChange'];
  onSplitShifts: PrepareEventTimeBlockListProps['onSplitShifts'];
  onHeadcountChange: PrepareEventTimeBlockListProps['onHeadcountChange'];
  onSaveHeadcounts: PrepareEventTimeBlockListProps['onSaveHeadcounts'];
}

function EventTimeBlockRow({
  eventView,
  eventTimeBlockView,
  headcountRows,
  hasSectors,
  roleCatalogStatus,
  onRetryRoleCatalog,
  splitForm,
  headcountDrafts,
  savedHeadcountDrafts,
  isSplitDirty,
  isHeadcountDirty,
  pendingHeadcountEventTimeBlockId,
  pendingSplitEventTimeBlockId,
  pendingInclusionEventTimeBlockId,
  expanded,
  onToggleExpanded,
  onToggleInclusion,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
}: EventTimeBlockRowProps) {
  const isMobile = useFormControlSize() === 'touch';
  const { churchTimezone } = useTimezone();
  const included = eventTimeBlockView.included;
  const isSavingSplit =
    pendingSplitEventTimeBlockId === eventTimeBlockView.eventTimeBlock.id;
  const isSavingInclusion =
    pendingInclusionEventTimeBlockId === eventTimeBlockView.eventTimeBlock.id;
  const isSavingHeadcounts =
    pendingHeadcountEventTimeBlockId === eventTimeBlockView.eventTimeBlock.id;
  /** Unlike `touchedParticipationIds` (only set on a successful save),
   * `isSplitDirty`/`isHeadcountDirty` reflect drafts typed but never saved —
   * collapsing the row must not hide that, since the collapsed summary line
   * otherwise falls back to server-confirmed `summarizeEventTimeBlock`, silently
   * masking exactly the edit the leader would lose by navigating away. */
  const hasUnsavedDraft = isSplitDirty || isHeadcountDirty;

  return (
    <div
      className="surface-subtle workspace-panel space-y-3"
      data-testid={`prepare-event-time-block-row-${eventTimeBlockView.eventTimeBlock.id}`}
    >
      <Collapsible open={included && expanded} onOpenChange={onToggleExpanded}>
        <div className="flex items-start gap-3 lg:grid lg:grid-cols-[24px_minmax(0,1fr)_170px_130px_28px] lg:items-center lg:gap-4">
          <div className="flex shrink-0 items-center gap-2 lg:contents">
            <div className="relative flex items-center">
              <Checkbox
                className="mt-0.5 lg:mt-0"
                data-testid={`serving-toggle-${eventTimeBlockView.eventTimeBlock.id}`}
                checked={included}
                disabled={isSavingInclusion}
                aria-label={included ? 'Serving' : 'Not serving'}
                aria-busy={isSavingInclusion}
                onCheckedChange={(checked) =>
                  onToggleInclusion({
                    participationId: eventView.participation.id,
                    eventTimeBlockId: eventTimeBlockView.eventTimeBlock.id,
                    checked: checked === true,
                  })
                }
              />
              {isSavingInclusion ? (
                <Loader2Icon
                  aria-hidden="true"
                  data-testid={`serving-toggle-saving-${eventTimeBlockView.eventTimeBlock.id}`}
                  className="absolute size-4 animate-spin text-muted-foreground motion-reduce:hidden"
                />
              ) : null}
            </div>
            <div className="space-y-1 lg:contents">
              <div className="font-medium">
                {eventView.event.title}
                {eventTimeBlockView.eventTimeBlock.label
                  ? ` · ${eventTimeBlockView.eventTimeBlock.label}`
                  : ''}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatTimeRange({
                  start: eventTimeBlockView.eventTimeBlock.startTime,
                  end: eventTimeBlockView.eventTimeBlock.endTime,
                  timeZone: churchTimezone,
                })}
              </div>
            </div>
            <span className="sr-only">
              {included ? 'Serving' : 'Not serving'}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="ml-auto lg:ml-0"
            data-testid="participation-state-badge"
          >
            {participationStateLabel({ state: eventView.participation.state })}
          </Badge>
          {included ? (
            <CollapsibleTrigger
              className="radius-control relative inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:bg-muted hover:text-foreground lg:justify-self-end"
              data-testid={`toggle-event-time-block-expand-${eventTimeBlockView.eventTimeBlock.id}`}
              aria-label={
                expanded
                  ? 'Collapse time block details'
                  : hasUnsavedDraft
                    ? 'Expand time block details — unsaved changes'
                    : 'Expand time block details'
              }
            >
              <ChevronDownIcon
                className={cn(
                  'size-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
              />
              {hasUnsavedDraft && !expanded ? (
                <span
                  aria-hidden="true"
                  data-testid={`prepare-event-time-block-unsaved-dot-${eventTimeBlockView.eventTimeBlock.id}`}
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </CollapsibleTrigger>
          ) : null}
        </div>

        {included && !expanded ? (
          <p
            className={cn(
              'pl-9 text-xs lg:pl-9',
              hasUnsavedDraft
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
            )}
            data-testid={`prepare-event-time-block-summary-${eventTimeBlockView.eventTimeBlock.id}`}
          >
            {hasUnsavedDraft
              ? 'Unsaved changes — expand to save.'
              : summarizeEventTimeBlock(eventTimeBlockView)}
          </p>
        ) : null}

        {included ? (
          <CollapsibleContent
            data-testid={`prepare-event-time-block-editor-${eventTimeBlockView.eventTimeBlock.id}`}
            className="overflow-hidden [transition:height_200ms_cubic-bezier(0.22,1,0.36,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
            style={{ height: 'var(--collapsible-panel-height)' }}
          >
            <div className="grid gap-5 border-border/60 border-t pt-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
              <SplitPanel
                eventTimeBlockView={eventTimeBlockView}
                participationId={eventView.participation.id}
                splitForm={splitForm}
                isSplitDirty={isSplitDirty}
                isSavingSplit={isSavingSplit}
                onSplitFormChange={onSplitFormChange}
                onSplitShifts={onSplitShifts}
              />
              <HeadcountPanel
                eventTimeBlockView={eventTimeBlockView}
                participationId={eventView.participation.id}
                headcountRows={headcountRows}
                hasSectors={hasSectors}
                roleCatalogStatus={roleCatalogStatus}
                onRetryRoleCatalog={onRetryRoleCatalog}
                headcountDrafts={headcountDrafts}
                savedHeadcountDrafts={savedHeadcountDrafts}
                isSplitDirty={isSplitDirty}
                isHeadcountDirty={isHeadcountDirty}
                isSavingHeadcounts={isSavingHeadcounts}
                onHeadcountChange={onHeadcountChange}
                onSaveHeadcounts={onSaveHeadcounts}
              />
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>

      {eventView.participation.state !== 'preparing' ? (
        <Link
          to="/schedules/$ministryId/$cycleId/assign"
          params={{
            cycleId: eventView.event.cycleId,
            ministryId: eventView.participation.ministryId,
          }}
          className={buttonVariants({
            variant: 'outline',
            size: isMobile ? 'touch' : 'default',
          })}
          data-testid={`open-schedule-link-${eventView.participation.id}`}
        >
          Open schedule
        </Link>
      ) : null}
    </div>
  );
}

interface SplitPanelProps {
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  participationId: string;
  splitForm: SplitFormState | undefined;
  isSplitDirty: boolean;
  isSavingSplit: boolean;
  onSplitFormChange: PrepareEventTimeBlockListProps['onSplitFormChange'];
  onSplitShifts: PrepareEventTimeBlockListProps['onSplitShifts'];
}

/** Left column of an expanded time block row: the shift-split editor and its own
 * dirty-gated "Save split" action, independent of headcount state (R12). */
function SplitPanel({
  eventTimeBlockView,
  participationId,
  splitForm,
  isSplitDirty,
  isSavingSplit,
  onSplitFormChange,
  onSplitShifts,
}: SplitPanelProps) {
  return (
    <div className="space-y-3">
      {splitForm ? (
        <ManualSplitEditor
          eventTimeBlockIndex={0}
          eventTimeBlockId={eventTimeBlockView.eventTimeBlock.id}
          eventTimeBlockView={eventTimeBlockView}
          splitForm={splitForm}
          onSplitFormChange={(nextForm) =>
            onSplitFormChange({
              eventTimeBlockId: eventTimeBlockView.eventTimeBlock.id,
              nextForm,
            })
          }
        />
      ) : null}

      <Button
        type="button"
        variant="outline"
        data-testid={`save-split-button-${eventTimeBlockView.eventTimeBlock.id}`}
        disabled={isSavingSplit || !isSplitDirty}
        onClick={() => onSplitShifts({ participationId, eventTimeBlockView })}
      >
        {isSavingSplit ? 'Saving…' : 'Save split'}
      </Button>
    </div>
  );
}

interface HeadcountPanelProps {
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  participationId: string;
  headcountRows: HeadcountRow[];
  hasSectors: boolean;
  roleCatalogStatus: RoleCatalogStatus;
  onRetryRoleCatalog: (() => void) | undefined;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  isSplitDirty: boolean;
  isHeadcountDirty: boolean;
  isSavingHeadcounts: boolean;
  onHeadcountChange: PrepareEventTimeBlockListProps['onHeadcountChange'];
  onSaveHeadcounts: PrepareEventTimeBlockListProps['onSaveHeadcounts'];
}

/** Right column of an expanded time block row: per-shift role/headcount inputs and
 * the single "Save headcounts" action spanning every shift in the time block
 * (R12/FR-021a), independent of split state. Also surfaces the sibling
 * split panel's own unsaved indicator (`isSplitDirty`) since both live in
 * the same visual column group but persist independently. */
function HeadcountPanel({
  eventTimeBlockView,
  participationId,
  headcountRows,
  hasSectors,
  roleCatalogStatus,
  onRetryRoleCatalog,
  headcountDrafts,
  savedHeadcountDrafts,
  isSplitDirty,
  isHeadcountDirty,
  isSavingHeadcounts,
  onHeadcountChange,
  onSaveHeadcounts,
}: HeadcountPanelProps) {
  const isMobile = useFormControlSize() === 'touch';
  const { churchTimezone } = useTimezone();
  const headcountSavesByShift = eventTimeBlockView.shifts.map((shift) => ({
    shiftId: shift.id,
    validHeadcounts: parseValidHeadcounts({
      shiftId: shift.id,
      headcountRows,
      headcountDrafts,
    }),
  }));
  const changedHeadcountSavesByShift = headcountSavesByShift
    .map((shiftSaves) => ({
      ...shiftSaves,
      validHeadcounts: shiftSaves.validHeadcounts.filter((headcount) => {
        const key = toHeadcountKey({
          shiftId: shiftSaves.shiftId,
          sectorId: headcount.sectorId,
          roleId: headcount.roleId,
        });
        return savedHeadcountDrafts[key] !== String(headcount.peopleNeeded);
      }),
    }))
    .filter((shiftSaves) => shiftSaves.validHeadcounts.length > 0);
  const hasUnsetHeadcount =
    roleCatalogStatus === 'ready' &&
    headcountRows.length > 0 &&
    headcountSavesByShift.some(
      (shiftSaves) => shiftSaves.validHeadcounts.length < headcountRows.length,
    );

  return (
    <div className="space-y-3">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        People needed
      </div>
      {isSplitDirty ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid={`split-unsaved-indicator-${eventTimeBlockView.eventTimeBlock.id}`}
        >
          Split changes not saved.
        </p>
      ) : null}
      {isHeadcountDirty ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid={`headcount-unsaved-indicator-${eventTimeBlockView.eventTimeBlock.id}`}
        >
          People needed changes not saved.
        </p>
      ) : null}
      {eventTimeBlockView.shifts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Save a split first so this time block has shifts to staff.
        </p>
      ) : (
        eventTimeBlockView.shifts.map((shift, shiftIndex) => (
          <div
            key={shift.id}
            className="space-y-3 border-border/60 border-t pt-3 first:border-t-0 first:pt-0"
            data-testid={`participation-shift-row-${shift.id}`}
          >
            <div className="space-y-1">
              <div className="font-medium text-sm">
                {shift.label || `Shift ${shiftIndex + 1}`}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatTimeRange({
                  start: shift.startTime,
                  end: shift.endTime,
                  timeZone: churchTimezone,
                })}
              </div>
            </div>

            {headcountRows.length === 0 && roleCatalogStatus === 'loading' ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid={`role-catalog-loading-${shift.id}`}
              >
                Loading roles…
              </p>
            ) : headcountRows.length === 0 && roleCatalogStatus === 'error' ? (
              <div
                className="flex items-center gap-3 text-destructive text-sm"
                data-testid={`role-catalog-error-${shift.id}`}
              >
                <span>Couldn't load roles for this event.</span>
                <Button
                  type="button"
                  size={isMobile ? 'touch' : 'sm'}
                  variant="outline"
                  onClick={() => onRetryRoleCatalog?.()}
                >
                  Retry
                </Button>
              </div>
            ) : headcountRows.length === 0 && !hasSectors ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid={`sector-catalog-empty-${shift.id}`}
              >
                No Sectors yet. Headcounts need at least one Sector.
              </p>
            ) : headcountRows.length === 0 ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid={`role-catalog-empty-${shift.id}`}
              >
                This ministry has no roles configured yet — set up roles before
                setting people needed.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {headcountRows.map((row) => {
                  const inputKey = toHeadcountKey({
                    shiftId: shift.id,
                    sectorId: row.sectorId,
                    roleId: row.roleId,
                  });
                  return (
                    <div key={inputKey} className="space-y-1">
                      <Label htmlFor={`headcount-${inputKey}`}>
                        {row.label}
                      </Label>
                      <HeadcountInput
                        inputKey={inputKey}
                        value={
                          headcountDrafts[
                            toHeadcountKey({
                              shiftId: shift.id,
                              sectorId: row.sectorId,
                              roleId: row.roleId,
                            })
                          ] ?? ''
                        }
                        onValueChange={(value) =>
                          onHeadcountChange({
                            shiftId: shift.id,
                            sectorId: row.sectorId,
                            roleId: row.roleId,
                            value,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
      {eventTimeBlockView.shifts.length > 0 ? (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            data-testid={`save-headcounts-button-${eventTimeBlockView.eventTimeBlock.id}`}
            disabled={
              isSavingHeadcounts ||
              !isHeadcountDirty ||
              hasUnsetHeadcount ||
              changedHeadcountSavesByShift.length === 0
            }
            onClick={() =>
              onSaveHeadcounts({
                participationId,
                eventTimeBlockId: eventTimeBlockView.eventTimeBlock.id,
                headcountSavesByShift: changedHeadcountSavesByShift,
              })
            }
          >
            {isSavingHeadcounts ? 'Saving…' : 'Save people needed'}
          </Button>
          {hasUnsetHeadcount ? (
            <p
              className="text-muted-foreground text-xs"
              data-testid={`headcount-save-explanation-${eventTimeBlockView.eventTimeBlock.id}`}
            >
              Enter a whole number of people needed for every role before
              saving.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
