import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import {
  formatDate,
  formatTimeRange,
  getSlotRoleOptions,
  participationStateLabel,
  type SplitFormState,
  toHeadcountKey,
  toIsoDateString,
} from '../participation-tailoring.utils';
import { ManualSplitEditor } from './manual-split-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
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

type RoleCatalogStatus = 'loading' | 'error' | 'ready';

export interface TailoringSlotListProps {
  events: GetCycleParticipation200EventsItem[];
  ministryId: string;
  splitForms: Record<string, SplitFormState>;
  headcountDrafts: Record<string, string>;
  pendingHeadcountShiftId: string | null;
  pendingSplitSlotId: string | null;
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
    shiftId: string;
    validHeadcounts: HeadcountSave[];
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
        dayKey: toIsoDateString(new Date(slotView.slot.startTime)),
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
    const count = Number.parseInt(raw, 10);
    if (!Number.isInteger(count) || count < 1 || String(count) !== raw.trim()) {
      return valid;
    }

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
  pendingHeadcountShiftId,
  pendingSplitSlotId,
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
        No slots match the current filters.
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
          <span>State</span>
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
                    pendingHeadcountShiftId={pendingHeadcountShiftId}
                    pendingSplitSlotId={pendingSplitSlotId}
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
  pendingHeadcountShiftId: string | null;
  pendingSplitSlotId: string | null;
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
  pendingHeadcountShiftId,
  pendingSplitSlotId,
  expanded,
  onToggleExpanded,
  onToggleInclusion,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
}: SlotRowProps) {
  const included = slotView.included;
  const isSavingSplit = pendingSplitSlotId === slotView.slot.id;

  return (
    <div
      className="surface-subtle workspace-panel space-y-3"
      data-testid={`tailoring-slot-row-${slotView.slot.id}`}
    >
      <Collapsible open={included && expanded} onOpenChange={onToggleExpanded}>
        <div className="flex items-start gap-3 lg:grid lg:grid-cols-[24px_minmax(0,1fr)_170px_130px_28px] lg:items-center lg:gap-4">
          <label className="contents">
            <input
              type="checkbox"
              className="radius-control mt-0.5 size-4 shrink-0 cursor-pointer accent-primary lg:mt-0"
              data-testid={`participation-slot-checkbox-${slotView.slot.id}`}
              checked={included}
              onChange={(event) =>
                onToggleInclusion({
                  participationId: eventView.participation.id,
                  timeSlotId: slotView.slot.id,
                  checked: event.target.checked,
                })
              }
            />
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
          </label>
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
                expanded ? 'Collapse slot details' : 'Expand slot details'
              }
            >
              <ChevronDownIcon
                className={cn(
                  'size-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
          ) : null}
        </div>

        {included && !expanded ? (
          <p
            className="pl-9 text-muted-foreground text-xs lg:pl-9"
            data-testid={`tailoring-slot-summary-${slotView.slot.id}`}
          >
            {summarizeSlot(slotView)}
          </p>
        ) : null}

        {included ? (
          <CollapsibleContent
            data-testid={`tailoring-slot-editor-${slotView.slot.id}`}
            className="overflow-hidden [transition:height_200ms_cubic-bezier(0.22,1,0.36,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
            style={{ height: 'var(--collapsible-panel-height)' }}
          >
            <div className="grid gap-5 border-border/60 border-t pt-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                {splitForm ? (
                  <ManualSplitEditor
                    slotIndex={0}
                    slotId={slotView.slot.id}
                    splitForm={splitForm}
                    onSplitFormChange={(nextForm) =>
                      onSplitFormChange({
                        timeSlotId: slotView.slot.id,
                        nextForm,
                      })
                    }
                  />
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  data-testid={`save-split-button-${slotView.slot.id}`}
                  disabled={isSavingSplit}
                  onClick={() =>
                    onSplitShifts({
                      participationId: eventView.participation.id,
                      slotView,
                    })
                  }
                >
                  {isSavingSplit ? 'Saving…' : 'Save split'}
                </Button>
              </div>

              <div className="space-y-3">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Headcount
                </div>
                {slotView.shifts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Save a split first so this slot has shifts to staff.
                  </p>
                ) : (
                  slotView.shifts.map((shift, shiftIndex) => {
                    const validHeadcounts = parseValidHeadcounts({
                      shiftId: shift.id,
                      roleOptions,
                      headcountDrafts,
                      requirements: slotView.requirements,
                    });
                    const isSavingHeadcounts =
                      pendingHeadcountShiftId === shift.id;

                    return (
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

                        {roleOptions.length === 0 &&
                        roleCatalogStatus === 'loading' ? (
                          <p
                            className="text-muted-foreground text-sm"
                            data-testid={`role-catalog-loading-${shift.id}`}
                          >
                            Loading roles…
                          </p>
                        ) : roleOptions.length === 0 &&
                          roleCatalogStatus === 'error' ? (
                          <div
                            className="flex items-center gap-3 text-destructive text-sm"
                            data-testid={`role-catalog-error-${shift.id}`}
                          >
                            <span>Couldn't load roles for this event.</span>
                            <Button
                              type="button"
                              size="sm"
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
                            This ministry has no roles configured yet — set up
                            roles before assigning headcounts.
                          </p>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {roleOptions.map((role) => (
                              <div key={role.id} className="space-y-1">
                                <Label
                                  htmlFor={`headcount-${shift.id}-${role.id}`}
                                >
                                  {role.name}
                                </Label>
                                <Input
                                  id={`headcount-${shift.id}-${role.id}`}
                                  data-testid={`headcount-input-${shift.id}-${role.id}`}
                                  type="number"
                                  min="1"
                                  step="1"
                                  placeholder="0"
                                  value={
                                    headcountDrafts[
                                      toHeadcountKey(shift.id, role.id)
                                    ] ?? ''
                                  }
                                  onChange={(event) =>
                                    onHeadcountChange({
                                      shiftId: shift.id,
                                      roleId: role.id,
                                      value: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          data-testid={`save-headcounts-button-${shift.id}`}
                          disabled={
                            isSavingHeadcounts || validHeadcounts.length === 0
                          }
                          onClick={() =>
                            onSaveHeadcounts({
                              participationId: eventView.participation.id,
                              shiftId: shift.id,
                              validHeadcounts,
                            })
                          }
                        >
                          {isSavingHeadcounts ? 'Saving…' : 'Save headcounts'}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
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
          className="radius-control inline-flex h-8 items-center justify-center border border-border bg-background px-2.5 font-medium text-sm transition-colors hover:bg-muted hover:text-foreground"
          data-testid={`open-roster-link-${eventView.participation.id}`}
        >
          Open roster
        </Link>
      ) : null}
    </div>
  );
}
