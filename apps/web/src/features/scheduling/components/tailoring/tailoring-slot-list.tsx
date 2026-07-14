import { useForm } from '@tanstack/react-form';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import z from 'zod';
import {
  formatDate,
  formatTimeRange,
  getSlotRoleOptions,
  participationStateLabel,
  type SplitFormState,
  toCalendarDateString,
  toHeadcountKey,
} from '../participation-tailoring.utils';
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
  GetCycleParticipation200EventsItemSlotsItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { adminApi } from '@/utils/api-instances';

export interface HeadcountSave {
  roleId: string;
  requiredCount: number;
  teamId?: string;
}

export interface HeadcountSavesForShift {
  shiftId: string;
  validHeadcounts: HeadcountSave[];
}

type RoleCatalogStatus = 'loading' | 'error' | 'ready';

const headcountValueSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Enter a whole-number headcount of at least 1.');

export interface TailoringSlotListProps {
  events: GetCycleParticipation200EventsItem[];
  ministryId: string;
  splitForms: Record<string, SplitFormState>;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  splitDirtySlotIds: Set<string>;
  headcountDirtySlotIds: Set<string>;
  pendingHeadcountSlotId: string | null;
  pendingSplitSlotId: string | null;
  pendingInclusionSlotId: string | null;
  onToggleInclusion: (input: {
    participationId: string;
    timeSlotId: string;
    checked: boolean;
  }) => void;
  onSplitFormChange: (input: {
    timeSlotId: string;
    nextForm: SplitFormState;
  }) => void;
  onSplitShifts: (input: {
    participationId: string;
    slotView: GetCycleParticipation200EventsItemSlotsItem;
  }) => void;
  onHeadcountChange: (input: {
    shiftId: string;
    roleId: string;
    value: string;
  }) => void;
  onSaveHeadcounts: (input: {
    participationId: string;
    timeSlotId: string;
    headcountSavesByShift: HeadcountSavesForShift[];
  }) => void;
}

interface FlatSlotRow {
  dayKey: string;
  eventView: GetCycleParticipation200EventsItem;
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}

function buildFlatDayGroups(
  events: GetCycleParticipation200EventsItem[],
): Map<string, FlatSlotRow[]> {
  const rows: FlatSlotRow[] = [];

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      rows.push({
        dayKey: toCalendarDateString(slotView.slot.startTime),
        eventView,
        slotView,
      });
    }
  }

  rows.sort(
    (left, right) =>
      new Date(left.slotView.slot.startTime).getTime() -
      new Date(right.slotView.slot.startTime).getTime(),
  );

  const groups = new Map<string, FlatSlotRow[]>();
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

function parseValidHeadcounts({
  shiftId,
  roleOptions,
  headcountDrafts,
  requirements,
}: {
  shiftId: string;
  roleOptions: GetScheduleBuilderData200RolesItem[];
  headcountDrafts: Record<string, string>;
  requirements: GetCycleParticipation200EventsItemSlotsItem['requirements'];
}): HeadcountSave[] {
  return roleOptions.reduce<HeadcountSave[]>((valid, role) => {
    const raw = headcountDrafts[toHeadcountKey(shiftId, role.id)] ?? '';
    if (!headcountValueSchema.safeParse(raw.trim()).success) {
      return valid;
    }
    const count = Number.parseInt(raw, 10);

    const existingRequirement = requirements.find(
      (requirement) =>
        requirement.shiftId === shiftId && requirement.roleId === role.id,
    );

    valid.push({
      roleId: role.id,
      requiredCount: count,
      teamId: existingRequirement?.teamId,
    });
    return valid;
  }, []);
}

interface HeadcountInputProps {
  shiftId: string;
  roleId: string;
  value: string;
  onValueChange: (value: string) => void;
}

function HeadcountInput({
  shiftId,
  roleId,
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
          id={`headcount-${shiftId}-${roleId}`}
          data-testid={`headcount-input-${shiftId}-${roleId}`}
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

function summarizeSlot(
  slotView: GetCycleParticipation200EventsItemSlotsItem,
): string {
  if (slotView.shifts.length === 0) return 'Not split into shifts yet';

  const shiftLabel = slotView.shifts.length === 1 ? 'shift' : 'shifts';
  const totalHeadcount = slotView.requirements.reduce(
    (sum, requirement) => sum + requirement.requiredCount,
    0,
  );
  if (totalHeadcount === 0) {
    return `${slotView.shifts.length} ${shiftLabel} · no headcounts set yet`;
  }

  const headcountLabel = totalHeadcount === 1 ? 'headcount' : 'headcounts';
  return `${slotView.shifts.length} ${shiftLabel} · ${totalHeadcount} ${headcountLabel} requested`;
}

/** Flat, day-grouped slot list — fully supersedes `ParticipationEventCard`'s
 * old nested-card rendering role (research.md R2): a day header row, then
 * inset event/slot rows, no card-in-card. Inclusion checkbox persists
 * immediately via `setParticipationInclusions` (T026); shift-split and
 * headcount editing wire the existing `splitParticipationShifts` and
 * headcount-upsert mutations unchanged (T027). */
export function TailoringSlotList({
  events,
  ministryId,
  splitForms,
  headcountDrafts,
  savedHeadcountDrafts,
  splitDirtySlotIds,
  headcountDirtySlotIds,
  pendingHeadcountSlotId,
  pendingSplitSlotId,
  pendingInclusionSlotId,
  onToggleInclusion,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
}: TailoringSlotListProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const uniqueEventIds = [...new Set(events.map((e) => e.event.id))];

  /** Collapsed by default (T-layout: wall-of-forms fix) — a slot only
   * expands when the leader explicitly opens it, or the instant they check
   * it in for the first time this session, since that's exactly when they
   * mean to configure its split/headcount next. */
  const [expandedSlotIds, setExpandedSlotIds] = useState<Set<string>>(
    new Set(),
  );
  const setSlotExpanded = (slotId: string, expanded: boolean) =>
    setExpandedSlotIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(slotId);
      } else {
        next.delete(slotId);
      }
      return next;
    });

  const roleQueries = useQueries({
    queries: uniqueEventIds.map((eventId) => ({
      queryKey: ['tailoring-role-catalog', eventId, ministryId],
      queryFn: () => adminApi.getScheduleBuilderData({ eventId, ministryId }),
      retry: false,
    })),
  });

  const rolesByEventId: Record<string, GetScheduleBuilderData200RolesItem[]> =
    {};
  const roleCatalogStatusByEventId: Record<string, RoleCatalogStatus> = {};
  const retryRoleCatalogByEventId: Record<string, () => void> = {};
  uniqueEventIds.forEach((eventId, index) => {
    const query = roleQueries[index];
    rolesByEventId[eventId] = query?.data?.roles ?? [];
    roleCatalogStatusByEventId[eventId] = query?.isError
      ? 'error'
      : query?.isLoading
        ? 'loading'
        : 'ready';
    retryRoleCatalogByEventId[eventId] = () => query?.refetch();
  });

  const dayGroups = buildFlatDayGroups(events);
  const sortedDayKeys = [...dayGroups.keys()].sort();

  if (sortedDayKeys.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="tailoring-slot-list-empty-state"
      >
        No slots match your filters. Try a different day, name, or time range.
      </p>
    );
  }

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <div className="space-y-4" data-testid="tailoring-slot-list">
        <div
          className="hidden border-border/60 border-b pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide lg:grid lg:grid-cols-[24px_minmax(0,1fr)_170px_130px_28px] lg:gap-4"
          data-testid="tailoring-slot-list-column-header"
        >
          <span aria-hidden="true" />
          <span>Slot</span>
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
                data-testid={`tailoring-day-header-${dayKey}`}
              >
                {formatDate(dayKey)}
              </div>

              <div className="space-y-2">
                {rows.map(({ eventView, slotView }) => (
                  <SlotRow
                    key={slotView.slot.id}
                    eventView={eventView}
                    slotView={slotView}
                    ministryId={ministryId}
                    roleOptions={getSlotRoleOptions({
                      roles: rolesByEventId[eventView.event.id] ?? [],
                      slotView,
                    })}
                    roleCatalogStatus={
                      roleCatalogStatusByEventId[eventView.event.id] ?? 'ready'
                    }
                    onRetryRoleCatalog={
                      retryRoleCatalogByEventId[eventView.event.id]
                    }
                    splitForm={splitForms[slotView.slot.id]}
                    headcountDrafts={headcountDrafts}
                    savedHeadcountDrafts={savedHeadcountDrafts}
                    isSplitDirty={splitDirtySlotIds.has(slotView.slot.id)}
                    isHeadcountDirty={headcountDirtySlotIds.has(
                      slotView.slot.id,
                    )}
                    pendingHeadcountSlotId={pendingHeadcountSlotId}
                    pendingSplitSlotId={pendingSplitSlotId}
                    pendingInclusionSlotId={pendingInclusionSlotId}
                    expanded={expandedSlotIds.has(slotView.slot.id)}
                    onToggleExpanded={() =>
                      setSlotExpanded(
                        slotView.slot.id,
                        !expandedSlotIds.has(slotView.slot.id),
                      )
                    }
                    onToggleInclusion={(input) => {
                      if (input.checked) {
                        setSlotExpanded(input.timeSlotId, true);
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

interface SlotRowProps {
  eventView: GetCycleParticipation200EventsItem;
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  ministryId: string;
  roleOptions: GetScheduleBuilderData200RolesItem[];
  roleCatalogStatus: RoleCatalogStatus;
  onRetryRoleCatalog: (() => void) | undefined;
  splitForm: SplitFormState | undefined;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  isSplitDirty: boolean;
  isHeadcountDirty: boolean;
  pendingHeadcountSlotId: string | null;
  pendingSplitSlotId: string | null;
  pendingInclusionSlotId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleInclusion: TailoringSlotListProps['onToggleInclusion'];
  onSplitFormChange: TailoringSlotListProps['onSplitFormChange'];
  onSplitShifts: TailoringSlotListProps['onSplitShifts'];
  onHeadcountChange: TailoringSlotListProps['onHeadcountChange'];
  onSaveHeadcounts: TailoringSlotListProps['onSaveHeadcounts'];
}

function SlotRow({
  eventView,
  slotView,
  roleOptions,
  roleCatalogStatus,
  onRetryRoleCatalog,
  splitForm,
  headcountDrafts,
  savedHeadcountDrafts,
  isSplitDirty,
  isHeadcountDirty,
  pendingHeadcountSlotId,
  pendingSplitSlotId,
  pendingInclusionSlotId,
  expanded,
  onToggleExpanded,
  onToggleInclusion,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
}: SlotRowProps) {
  const isMobile = useFormControlSize() === 'touch';
  const included = slotView.included;
  const isSavingSplit = pendingSplitSlotId === slotView.slot.id;
  const isSavingInclusion = pendingInclusionSlotId === slotView.slot.id;
  const isSavingHeadcounts = pendingHeadcountSlotId === slotView.slot.id;
  /** Unlike `touchedParticipationIds` (only set on a successful save),
   * `isSplitDirty`/`isHeadcountDirty` reflect drafts typed but never saved —
   * collapsing the row must not hide that, since the collapsed summary line
   * otherwise falls back to server-confirmed `summarizeSlot`, silently
   * masking exactly the edit the leader would lose by navigating away. */
  const hasUnsavedDraft = isSplitDirty || isHeadcountDirty;

  return (
    <div
      className="surface-subtle workspace-panel space-y-3"
      data-testid={`tailoring-slot-row-${slotView.slot.id}`}
    >
      <Collapsible open={included && expanded} onOpenChange={onToggleExpanded}>
        <div className="flex items-start gap-3 lg:grid lg:grid-cols-[24px_minmax(0,1fr)_170px_130px_28px] lg:items-center lg:gap-4">
          <div className="flex shrink-0 items-center gap-2 lg:contents">
            <div className="relative flex items-center">
              <Checkbox
                className="mt-0.5 lg:mt-0"
                data-testid={`serving-toggle-${slotView.slot.id}`}
                checked={included}
                disabled={isSavingInclusion}
                aria-label={included ? 'Serving' : 'Not serving'}
                aria-busy={isSavingInclusion}
                onCheckedChange={(checked) =>
                  onToggleInclusion({
                    participationId: eventView.participation.id,
                    timeSlotId: slotView.slot.id,
                    checked: checked === true,
                  })
                }
              />
              {isSavingInclusion ? (
                <Loader2Icon
                  aria-hidden="true"
                  data-testid={`serving-toggle-saving-${slotView.slot.id}`}
                  className="absolute size-4 animate-spin text-muted-foreground motion-reduce:hidden"
                />
              ) : null}
            </div>
            <div className="space-y-1 lg:contents">
              <div className="font-medium">
                {eventView.event.title}
                {slotView.slot.label ? ` · ${slotView.slot.label}` : ''}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatTimeRange({
                  start: slotView.slot.startTime,
                  end: slotView.slot.endTime,
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
              data-testid={`toggle-slot-expand-${slotView.slot.id}`}
              aria-label={
                expanded
                  ? 'Collapse slot details'
                  : hasUnsavedDraft
                    ? 'Expand slot details — unsaved changes'
                    : 'Expand slot details'
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
                  data-testid={`tailoring-slot-unsaved-dot-${slotView.slot.id}`}
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
            data-testid={`tailoring-slot-summary-${slotView.slot.id}`}
          >
            {hasUnsavedDraft
              ? 'Unsaved changes — expand to save.'
              : summarizeSlot(slotView)}
          </p>
        ) : null}

        {included ? (
          <CollapsibleContent
            data-testid={`tailoring-slot-editor-${slotView.slot.id}`}
            className="overflow-hidden [transition:height_200ms_cubic-bezier(0.22,1,0.36,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
            style={{ height: 'var(--collapsible-panel-height)' }}
          >
            <div className="grid gap-5 border-border/60 border-t pt-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
              <SplitPanel
                slotView={slotView}
                participationId={eventView.participation.id}
                splitForm={splitForm}
                isSplitDirty={isSplitDirty}
                isSavingSplit={isSavingSplit}
                onSplitFormChange={onSplitFormChange}
                onSplitShifts={onSplitShifts}
              />
              <HeadcountPanel
                slotView={slotView}
                participationId={eventView.participation.id}
                roleOptions={roleOptions}
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

      {eventView.participation.state !== 'tailoring' ? (
        <Link
          to="/scheduling/rostering/$cycleId/$ministryId/$participationId"
          params={{
            cycleId: eventView.event.planningCycleId,
            ministryId: eventView.participation.ministryId,
            participationId: eventView.participation.id,
          }}
          className={buttonVariants({
            variant: 'outline',
            size: isMobile ? 'touch' : 'default',
          })}
          data-testid={`open-roster-link-${eventView.participation.id}`}
        >
          Open roster
        </Link>
      ) : null}
    </div>
  );
}

interface SplitPanelProps {
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  participationId: string;
  splitForm: SplitFormState | undefined;
  isSplitDirty: boolean;
  isSavingSplit: boolean;
  onSplitFormChange: TailoringSlotListProps['onSplitFormChange'];
  onSplitShifts: TailoringSlotListProps['onSplitShifts'];
}

/** Left column of an expanded slot row: the shift-split editor and its own
 * dirty-gated "Save split" action, independent of headcount state (R12). */
function SplitPanel({
  slotView,
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
          slotIndex={0}
          slotId={slotView.slot.id}
          slotView={slotView}
          splitForm={splitForm}
          onSplitFormChange={(nextForm) =>
            onSplitFormChange({ timeSlotId: slotView.slot.id, nextForm })
          }
        />
      ) : null}

      <Button
        type="button"
        variant="outline"
        data-testid={`save-split-button-${slotView.slot.id}`}
        disabled={isSavingSplit || !isSplitDirty}
        onClick={() => onSplitShifts({ participationId, slotView })}
      >
        {isSavingSplit ? 'Saving…' : 'Save split'}
      </Button>
    </div>
  );
}

interface HeadcountPanelProps {
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  participationId: string;
  roleOptions: GetScheduleBuilderData200RolesItem[];
  roleCatalogStatus: RoleCatalogStatus;
  onRetryRoleCatalog: (() => void) | undefined;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  isSplitDirty: boolean;
  isHeadcountDirty: boolean;
  isSavingHeadcounts: boolean;
  onHeadcountChange: TailoringSlotListProps['onHeadcountChange'];
  onSaveHeadcounts: TailoringSlotListProps['onSaveHeadcounts'];
}

/** Right column of an expanded slot row: per-shift role/headcount inputs and
 * the single "Save headcounts" action spanning every shift in the slot
 * (R12/FR-021a), independent of split state. Also surfaces the sibling
 * split panel's own unsaved indicator (`isSplitDirty`) since both live in
 * the same visual column group but persist independently. */
function HeadcountPanel({
  slotView,
  participationId,
  roleOptions,
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
  const headcountSavesByShift = slotView.shifts.map((shift) => ({
    shiftId: shift.id,
    validHeadcounts: parseValidHeadcounts({
      shiftId: shift.id,
      roleOptions,
      headcountDrafts,
      requirements: slotView.requirements,
    }),
  }));
  const changedHeadcountSavesByShift = headcountSavesByShift
    .map((shiftSaves) => ({
      ...shiftSaves,
      validHeadcounts: shiftSaves.validHeadcounts.filter((headcount) => {
        const key = toHeadcountKey(shiftSaves.shiftId, headcount.roleId);
        return savedHeadcountDrafts[key] !== String(headcount.requiredCount);
      }),
    }))
    .filter((shiftSaves) => shiftSaves.validHeadcounts.length > 0);
  const hasUnsetHeadcount =
    roleCatalogStatus === 'ready' &&
    roleOptions.length > 0 &&
    headcountSavesByShift.some(
      (shiftSaves) => shiftSaves.validHeadcounts.length < roleOptions.length,
    );

  return (
    <div className="space-y-3">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Headcount
      </div>
      {isSplitDirty ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid={`split-unsaved-indicator-${slotView.slot.id}`}
        >
          Split changes not saved.
        </p>
      ) : null}
      {isHeadcountDirty ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid={`headcount-unsaved-indicator-${slotView.slot.id}`}
        >
          Headcount changes not saved.
        </p>
      ) : null}
      {slotView.shifts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Save a split first so this slot has shifts to staff.
        </p>
      ) : (
        slotView.shifts.map((shift, shiftIndex) => (
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
                })}
              </div>
            </div>

            {roleOptions.length === 0 && roleCatalogStatus === 'loading' ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid={`role-catalog-loading-${shift.id}`}
              >
                Loading roles…
              </p>
            ) : roleOptions.length === 0 && roleCatalogStatus === 'error' ? (
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
            ) : roleOptions.length === 0 ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid={`role-catalog-empty-${shift.id}`}
              >
                This ministry has no roles configured yet — set up roles before
                assigning headcounts.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <div key={role.id} className="space-y-1">
                    <Label htmlFor={`headcount-${shift.id}-${role.id}`}>
                      {role.name}
                    </Label>
                    <HeadcountInput
                      shiftId={shift.id}
                      roleId={role.id}
                      value={
                        headcountDrafts[toHeadcountKey(shift.id, role.id)] ?? ''
                      }
                      onValueChange={(value) =>
                        onHeadcountChange({
                          shiftId: shift.id,
                          roleId: role.id,
                          value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
      {slotView.shifts.length > 0 ? (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            data-testid={`save-headcounts-button-${slotView.slot.id}`}
            disabled={
              isSavingHeadcounts ||
              !isHeadcountDirty ||
              hasUnsetHeadcount ||
              changedHeadcountSavesByShift.length === 0
            }
            onClick={() =>
              onSaveHeadcounts({
                participationId,
                timeSlotId: slotView.slot.id,
                headcountSavesByShift: changedHeadcountSavesByShift,
              })
            }
          >
            {isSavingHeadcounts ? 'Saving…' : 'Save headcounts'}
          </Button>
          {hasUnsetHeadcount ? (
            <p
              className="text-muted-foreground text-xs"
              data-testid={`headcount-save-explanation-${slotView.slot.id}`}
            >
              Enter a whole-number headcount for every role before saving.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
