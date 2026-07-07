import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@church/ui/components/select';
import { Skeleton } from '@church/ui/components/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AvailabilityStatusSection } from './availability-status-section';
import {
  buildCycleOptions,
  countIncludedSlots,
  countShifts,
  createInitialHeadcountDrafts,
  createInitialInclusions,
  createInitialSplitForms,
  formatDate,
  formatTimeRange,
  getSlotRoleOptions,
  type ManualSpanDraft,
  type SplitFormState,
  toHeadcountKey,
  toIsoString,
  validateManualSpans,
} from './participation-tailoring.utils';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export interface SaveInclusionsParams {
  participationId: string;
  timeSlotIds: string[];
}

export interface SplitShiftsParams {
  participationId: string;
  timeSlotId: string;
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}

export interface SaveHeadcountsParams {
  shiftId: string;
  requirements: GetCycleParticipation200EventsItemSlotsItem['requirements'];
  roleOptions: GetScheduleBuilderData200RolesItem[];
}

export interface FireAvailabilityParams {
  participationId: string;
}

export interface ResendAvailabilityParams {
  participationId: string;
}

export function ParticipationTailoring() {
  const queryClient = useQueryClient();
  const [selectedMinistryId, setSelectedMinistryId] = useState<string | null>(
    null,
  );
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [draftInclusions, setDraftInclusions] = useState<
    Record<string, string[]>
  >({});
  const [splitForms, setSplitForms] = useState<Record<string, SplitFormState>>(
    {},
  );
  const [headcountDrafts, setHeadcountDrafts] = useState<
    Record<string, string>
  >({});
  const [fireSummaries, setFireSummaries] = useState<
    Record<
      string,
      { createdCheckCount: number; notifiedVolunteerCount: number }
    >
  >({});

  const ministriesQuery = useQuery({
    queryKey: ['tailoring-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const ministries = ministriesQuery.data?.ministries ?? [];

  useEffect(() => {
    if (!selectedMinistryId && ministries[0]) {
      setSelectedMinistryId(ministries[0].id);
    }
  }, [ministries, selectedMinistryId]);

  const eventsQuery = useQuery({
    queryKey: ['tailoring-events', selectedMinistryId],
    queryFn: () =>
      adminApi.listEvents({ ministryId: selectedMinistryId ?? '' }),
    enabled: Boolean(selectedMinistryId),
    retry: false,
  });
  const cycleOptions = buildCycleOptions(
    (eventsQuery.data?.events ?? []).map((event) => ({
      planningCycleId: event.planningCycleId,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
    })),
  );
  const selectedCycleOption =
    cycleOptions.find((cycle) => cycle.id === selectedCycleId) ?? null;

  useEffect(() => {
    if (cycleOptions.length === 0) {
      if (selectedCycleId) setSelectedCycleId(null);
      return;
    }

    const stillExists = cycleOptions.some((opt) => opt.id === selectedCycleId);
    if (!stillExists && cycleOptions[0]) {
      setSelectedCycleId(cycleOptions[0].id);
    }
  }, [cycleOptions, selectedCycleId]);

  const participationQuery = useQuery({
    queryKey: ['cycle-participation', selectedMinistryId, selectedCycleId],
    queryFn: () =>
      adminApi.getCycleParticipation(selectedCycleId ?? '', {
        ministryId: selectedMinistryId ?? '',
      }),
    enabled: Boolean(selectedMinistryId && selectedCycleId),
    retry: false,
  });
  const participationEvents = participationQuery.data?.events ?? [];
  // roleCatalogQuery is now moved inside ParticipationEventCard for per-event roles.

  useEffect(() => {
    if (!participationQuery.data) return;

    setDraftInclusions(createInitialInclusions(participationQuery.data.events));
    setSplitForms(createInitialSplitForms(participationQuery.data.events));
    setHeadcountDrafts(
      createInitialHeadcountDrafts(participationQuery.data.events),
    );
  }, [participationQuery.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset summary map when cycle or ministry changes
  useEffect(() => {
    setFireSummaries({});
  }, [selectedCycleId, selectedMinistryId]);

  const refreshParticipation = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['cycle-participation', selectedMinistryId, selectedCycleId],
    });
  };

  const saveInclusions = useMutation({
    mutationFn: async ({
      participationId,
      timeSlotIds,
    }: SaveInclusionsParams) => {
      await adminApi.setParticipationInclusions(participationId, {
        timeSlotIds,
      });
    },
    onSuccess: async () => {
      toast.success('Included slots saved.');
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const splitShifts = useMutation({
    mutationFn: async ({
      participationId,
      timeSlotId,
      slotView,
    }: SplitShiftsParams) => {
      const form = splitForms[timeSlotId];
      if (!form) throw new Error('Split form is missing.');

      if (form.mode === 'equal') {
        const count = Number.parseInt(form.equalCount, 10);
        if (!Number.isInteger(count) || count < 1) {
          throw new Error('Equal split count must be 1 or greater.');
        }

        await adminApi.splitParticipationShifts(participationId, timeSlotId, {
          strategy: { kind: 'equal-n', n: count },
        });
        return;
      }

      const error = validateManualSpans({ slotView, spans: form.manualSpans });
      if (error) throw new Error(error);

      await adminApi.splitParticipationShifts(participationId, timeSlotId, {
        strategy: {
          kind: 'manual',
          spans: form.manualSpans.map((span) => ({
            startTime: toIsoString(span.startTime),
            endTime: toIsoString(span.endTime),
            label: span.label || undefined,
          })),
        },
      });
    },
    onSuccess: async () => {
      toast.success('Shifts updated.');
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveHeadcounts = useMutation({
    mutationFn: async ({
      shiftId,
      requirements,
      roleOptions,
    }: SaveHeadcountsParams) => {
      const saves = roleOptions
        .map((role) => {
          const rawCount =
            headcountDrafts[toHeadcountKey(shiftId, role.id)] ?? '';
          const count = Number.parseInt(rawCount, 10);
          if (!Number.isInteger(count) || count < 1) return null;

          const existingRequirement = requirements.find(
            (requirement) =>
              requirement.shiftId === shiftId && requirement.roleId === role.id,
          );

          return adminApi.upsertShiftRequirement(shiftId, {
            roleId: role.id,
            teamId: existingRequirement?.teamId,
            requiredCount: count,
          });
        })
        .filter(Boolean);

      if (saves.length === 0) {
        throw new Error('Add at least one positive headcount before saving.');
      }

      await Promise.all(saves);
    },
    onSuccess: async () => {
      toast.success('Headcounts saved.');
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const fireAvailability = useMutation({
    mutationFn: ({ participationId }: FireAvailabilityParams) =>
      adminApi.fireAvailability(participationId),
    onSuccess: async (result, variables) => {
      setFireSummaries((current) => ({
        ...current,
        [variables.participationId]: result,
      }));
      toast.success('Availability requests sent.');
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const resendAvailability = useMutation({
    mutationFn: ({ participationId }: ResendAvailabilityParams) =>
      adminApi.resendAvailabilityReminder(participationId),
    onSuccess: () => {
      toast.success('Availability reminder resent.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const selectedMinistry =
    ministries.find((ministry) => ministry.id === selectedMinistryId) ??
    ministries[0];
  const includedSlotCount = countIncludedSlots(participationEvents);
  const shiftCount = countShifts(participationEvents);
  const isLoadingScope = ministriesQuery.isLoading || eventsQuery.isLoading;
  const hasScope =
    !isLoadingScope && !ministriesQuery.isError && ministries.length > 0;

  return (
    <WorkspacePage data-testid="participation-tailoring-page">
      <WorkspaceIntroPanel
        title="Participation tailoring"
        description="Confirm which slots your ministry serves, split them into workable shifts, set headcounts, then fire availability."
        autoFocusTitle
        aside={
          selectedMinistry && !isLoadingScope ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <div className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
                <span className="font-medium">{selectedMinistry.name}</span>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-muted-foreground text-xs">
                  {selectedMinistry.defaultDirection ?? 'all_out'}
                </span>
              </div>
              <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Slots</span>{' '}
                <span
                  className="font-medium"
                  data-testid="tailoring-included-count"
                >
                  {includedSlotCount}
                </span>
              </div>
              <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Shifts</span>{' '}
                <span
                  className="font-medium"
                  data-testid="tailoring-shift-count"
                >
                  {shiftCount}
                </span>
              </div>
            </div>
          ) : null
        }
      />

      {isLoadingScope ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : ministriesQuery.isError ? (
        <div className="surface-subtle workspace-panel text-destructive text-sm">
          {getErrorMessage(ministriesQuery.error)}
        </div>
      ) : ministries.length === 0 ? (
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>No ministries yet</CardTitle>
            <CardDescription>
              Join or create a ministry before tailoring participation.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
              <CardDescription>
                Pick the ministry and locked cycle you want to tailor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Ministry</Label>
                <Select
                  value={selectedMinistryId ?? ''}
                  onValueChange={(ministryId) =>
                    setSelectedMinistryId(ministryId)
                  }
                >
                  <SelectTrigger
                    id="tailoring-ministry-select"
                    aria-label="Ministry"
                    data-testid="tailoring-ministry-select"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select a ministry">
                      {selectedMinistry?.name ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ministries.map((ministry) => (
                      <SelectItem
                        key={ministry.id}
                        value={ministry.id}
                        data-testid={`tailoring-ministry-option-${ministry.id}`}
                      >
                        {ministry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Cycle</Label>
                <Select
                  value={selectedCycleId ?? ''}
                  onValueChange={(cycleId) => setSelectedCycleId(cycleId)}
                >
                  <SelectTrigger
                    id="tailoring-cycle-select"
                    aria-label="Cycle"
                    data-testid="tailoring-cycle-select"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select a cycle">
                      {selectedCycleOption
                        ? `${selectedCycleOption.label} (${selectedCycleOption.eventCount} events)`
                        : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {cycleOptions.map((cycle) => (
                      <SelectItem
                        key={cycle.id}
                        value={cycle.id}
                        data-testid={`tailoring-cycle-option-${cycle.id}`}
                      >
                        {cycle.label} ({cycle.eventCount} events)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className="surface-subtle workspace-panel text-sm"
                data-testid="tailoring-summary-card"
              >
                <div className="font-medium">{selectedMinistry?.name}</div>
                <div className="mt-1 text-muted-foreground text-xs">
                  Default direction:{' '}
                  {selectedMinistry?.defaultDirection ?? 'all_out'}
                </div>
                <div className="mt-3 text-muted-foreground text-xs">
                  {participationEvents.length} events in this cycle
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>
                Save included slots first. Splits and headcounts update only the
                selected participation, not sibling ministries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6">
              <p>1. Keep only the slots this ministry will actually serve.</p>
              <p>2. Split long slots into equal or manual shifts.</p>
              <p>3. Save the required headcount per role on each shift.</p>
              <p>4. Fire availability when the participation is ready.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {hasScope ? (
        <>
          {participationQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : eventsQuery.isError ? (
            <div
              className="surface-subtle workspace-panel text-destructive text-sm"
              data-testid="events-error-state"
            >
              {getErrorMessage(eventsQuery.error)}
            </div>
          ) : participationQuery.isError ? (
            <div className="surface-subtle workspace-panel text-destructive text-sm">
              {getErrorMessage(participationQuery.error)}
            </div>
          ) : !selectedCycleId ? (
            <Card className="surface-panel">
              <CardHeader>
                <CardTitle>No planning cycles</CardTitle>
                <CardDescription>
                  Create and lock a cycle first so this ministry has events to
                  tailor.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : participationEvents.length === 0 ? (
            <Card className="surface-panel">
              <CardHeader>
                <CardTitle>No participation data</CardTitle>
                <CardDescription>
                  Lock and generate a cycle first so this ministry has events to
                  tailor.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {participationEvents.map((eventView) => (
                <ParticipationEventCard
                  key={eventView.participation.id}
                  eventView={eventView}
                  draftInclusions={
                    draftInclusions[eventView.participation.id] ?? []
                  }
                  splitForms={splitForms}
                  headcountDrafts={headcountDrafts}
                  cycleId={selectedCycleId ?? ''}
                  ministryId={selectedMinistryId ?? ''}
                  fireSummary={fireSummaries[eventView.participation.id]}
                  saveInclusionsPending={saveInclusions.isPending}
                  splitPending={splitShifts.isPending}
                  saveHeadcountsPending={saveHeadcounts.isPending}
                  firePending={fireAvailability.isPending}
                  resendPending={resendAvailability.isPending}
                  onToggleInclusion={(timeSlotId, checked) => {
                    setDraftInclusions((current) => {
                      const previous =
                        current[eventView.participation.id] ?? [];
                      const next = checked
                        ? [...new Set([...previous, timeSlotId])]
                        : previous.filter((id) => id !== timeSlotId);
                      return { ...current, [eventView.participation.id]: next };
                    });
                  }}
                  onSaveInclusions={() =>
                    saveInclusions.mutate({
                      participationId: eventView.participation.id,
                      timeSlotIds:
                        draftInclusions[eventView.participation.id] ?? [],
                    })
                  }
                  onSplitFormChange={(timeSlotId, nextForm) =>
                    setSplitForms((current) => ({
                      ...current,
                      [timeSlotId]: nextForm,
                    }))
                  }
                  onSplitShifts={(slotView) =>
                    splitShifts.mutate({
                      participationId: eventView.participation.id,
                      timeSlotId: slotView.slot.id,
                      slotView,
                    })
                  }
                  onHeadcountChange={(shiftId, roleId, value) =>
                    setHeadcountDrafts((current) => ({
                      ...current,
                      [toHeadcountKey(shiftId, roleId)]: value,
                    }))
                  }
                  onSaveHeadcounts={(shiftId, slotView, roleOptions) =>
                    saveHeadcounts.mutate({
                      shiftId,
                      requirements: slotView.requirements,
                      roleOptions,
                    })
                  }
                  onFireAvailability={() =>
                    fireAvailability.mutate({
                      participationId: eventView.participation.id,
                    })
                  }
                  onResendAvailability={() =>
                    resendAvailability.mutate({
                      participationId: eventView.participation.id,
                    })
                  }
                />
              ))}
            </div>
          )}

          {selectedCycleId && selectedMinistryId ? (
            <AvailabilityStatusSection
              cycleId={selectedCycleId}
              ministryId={selectedMinistryId}
            />
          ) : null}
        </>
      ) : null}
    </WorkspacePage>
  );
}

interface FireSummaryState {
  createdCheckCount: number;
  notifiedVolunteerCount: number;
}

interface ParticipationEventCardProps {
  eventView: GetCycleParticipation200EventsItem;
  draftInclusions: string[];
  splitForms: Record<string, SplitFormState>;
  headcountDrafts: Record<string, string>;
  cycleId: string;
  ministryId: string;
  fireSummary?: FireSummaryState;
  saveInclusionsPending: boolean;
  splitPending: boolean;
  saveHeadcountsPending: boolean;
  firePending: boolean;
  resendPending: boolean;
  onToggleInclusion: (timeSlotId: string, checked: boolean) => void;
  onSaveInclusions: () => void;
  onSplitFormChange: (timeSlotId: string, nextForm: SplitFormState) => void;
  onSplitShifts: (
    slotView: GetCycleParticipation200EventsItemSlotsItem,
  ) => void;
  onHeadcountChange: (shiftId: string, roleId: string, value: string) => void;
  onSaveHeadcounts: (
    shiftId: string,
    slotView: GetCycleParticipation200EventsItemSlotsItem,
    roleOptions: GetScheduleBuilderData200RolesItem[],
  ) => void;
  onFireAvailability: () => void;
  onResendAvailability: () => void;
}

function ParticipationEventCard({
  eventView,
  draftInclusions,
  splitForms,
  headcountDrafts,
  cycleId,
  ministryId,
  fireSummary,
  saveInclusionsPending,
  splitPending,
  saveHeadcountsPending,
  firePending,
  resendPending,
  onToggleInclusion,
  onSaveInclusions,
  onSplitFormChange,
  onSplitShifts,
  onHeadcountChange,
  onSaveHeadcounts,
  onFireAvailability,
  onResendAvailability,
}: ParticipationEventCardProps) {
  const roleCatalogQuery = useQuery({
    queryKey: ['tailoring-role-catalog', eventView.event.id, ministryId],
    queryFn: () =>
      adminApi.getScheduleBuilderData({
        eventId: eventView.event.id,
        ministryId,
      }),
    retry: false,
  });
  const roles = roleCatalogQuery.data?.roles ?? [];
  const eventRoleOptions =
    roles.length > 0
      ? roles
      : [
          ...new Set(
            eventView.slots.flatMap((slot) =>
              slot.requirements.map((r) => r.roleId),
            ),
          ),
        ].map((roleId) => ({ id: roleId, name: roleId }));

  return (
    <Card className="surface-panel" data-testid="participation-event-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{eventView.event.title}</CardTitle>
            <CardDescription>
              {formatDate(eventView.event.startDate)} · {eventView.slots.length}{' '}
              slots
            </CardDescription>
          </div>
          <Badge data-testid="participation-state-badge">
            {eventView.participation.state}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {eventView.slots.map((slotView, slotIndex) => {
            const included = draftInclusions.includes(slotView.slot.id);
            const splitForm = splitForms[slotView.slot.id];
            const roleOptions = getSlotRoleOptions({
              roles: eventRoleOptions,
              slotView,
            });

            return (
              <div
                key={slotView.slot.id}
                className="surface-subtle workspace-panel space-y-3"
                data-testid="participation-slot-card"
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="radius-control mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                    data-testid={`participation-slot-checkbox-${slotIndex}`}
                    checked={included}
                    onChange={(event) =>
                      onToggleInclusion(slotView.slot.id, event.target.checked)
                    }
                  />
                  <div className="space-y-1">
                    <div className="font-medium">
                      {slotView.slot.label ?? `Slot ${slotIndex + 1}`}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatTimeRange({
                        start: slotView.slot.startTime,
                        end: slotView.slot.endTime,
                      })}
                    </div>
                  </div>
                </label>

                {included && splitForm ? (
                  <div className="grid gap-5 border-border/60 border-t pt-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Shift split form
                      </div>
                      <select
                        data-testid={`shift-mode-select-${slotIndex}`}
                        className="w-full text-sm"
                        value={splitForm.mode}
                        onChange={(event) =>
                          onSplitFormChange(slotView.slot.id, {
                            ...splitForm,
                            mode:
                              event.target.value === 'manual'
                                ? 'manual'
                                : 'equal',
                          })
                        }
                      >
                        <option value="equal">Equal split</option>
                        <option value="manual">Manual spans</option>
                      </select>

                      {splitForm.mode === 'equal' ? (
                        <div className="space-y-2">
                          <Label htmlFor={`equal-count-${slotView.slot.id}`}>
                            Number of shifts
                          </Label>
                          <Input
                            id={`equal-count-${slotView.slot.id}`}
                            data-testid={`equal-split-count-${slotIndex}`}
                            type="number"
                            min="1"
                            value={splitForm.equalCount}
                            onChange={(event) =>
                              onSplitFormChange(slotView.slot.id, {
                                ...splitForm,
                                equalCount: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <ManualSplitEditor
                          slotIndex={slotIndex}
                          splitForm={splitForm}
                          onChange={(manualSpans) =>
                            onSplitFormChange(slotView.slot.id, {
                              ...splitForm,
                              manualSpans,
                            })
                          }
                        />
                      )}

                      <Button
                        type="button"
                        data-testid={`save-split-button-${slotIndex}`}
                        disabled={splitPending}
                        onClick={() => onSplitShifts(slotView)}
                      >
                        {splitPending ? 'Saving…' : 'Save split'}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Headcount matrix
                      </div>
                      {slotView.shifts.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          Save a split first so this slot has shifts to staff.
                        </p>
                      ) : (
                        slotView.shifts.map((shift, shiftIndex) => (
                          <div
                            key={shift.id}
                            className="surface-panel workspace-panel space-y-3"
                            data-testid="participation-shift-card"
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
                                    data-testid={`headcount-input-${slotIndex}-${shiftIndex}-${role.id}`}
                                    type="number"
                                    min="0"
                                    value={
                                      headcountDrafts[
                                        toHeadcountKey(shift.id, role.id)
                                      ] ?? ''
                                    }
                                    onChange={(event) =>
                                      onHeadcountChange(
                                        shift.id,
                                        role.id,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </div>

                            <Button
                              type="button"
                              data-testid={`save-headcounts-button-${slotIndex}-${shiftIndex}`}
                              disabled={saveHeadcountsPending}
                              onClick={() =>
                                onSaveHeadcounts(
                                  shift.id,
                                  slotView,
                                  roleOptions,
                                )
                              }
                            >
                              {saveHeadcountsPending
                                ? 'Saving…'
                                : 'Save headcounts'}
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            data-testid={`save-inclusions-button-${eventView.participation.id}`}
            disabled={saveInclusionsPending}
            onClick={onSaveInclusions}
          >
            {saveInclusionsPending ? 'Saving…' : 'Save included slots'}
          </Button>

          {eventView.participation.state === 'tailoring' ? (
            <Button
              type="button"
              data-testid={`fire-availability-button-${eventView.participation.id}`}
              disabled={firePending}
              onClick={onFireAvailability}
            >
              {firePending ? 'Firing…' : 'Fire availability'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              data-testid={`resend-availability-button-${eventView.participation.id}`}
              disabled={resendPending}
              onClick={onResendAvailability}
            >
              {resendPending ? 'Resending…' : 'Resend reminder'}
            </Button>
          )}

          {fireSummary ? (
            <div
              className="text-muted-foreground text-xs"
              data-testid="fire-availability-summary"
            >
              {fireSummary.createdCheckCount} checks created ·{' '}
              {fireSummary.notifiedVolunteerCount} volunteers notified
            </div>
          ) : null}

          {eventView.participation.state !== 'tailoring' ? (
            <Link
              to="/scheduling/rostering/$cycleId/$ministryId/$participationId"
              params={{
                cycleId,
                ministryId,
                participationId: eventView.participation.id,
              }}
              className="radius-control inline-flex h-8 items-center justify-center border border-border bg-background px-2.5 font-medium text-sm transition-colors hover:bg-muted hover:text-foreground"
              data-testid={`open-roster-link-${eventView.participation.id}`}
            >
              Open roster
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ManualSplitEditor({
  slotIndex,
  splitForm,
  onChange,
}: {
  slotIndex: number;
  splitForm: SplitFormState;
  onChange: (manualSpans: ManualSpanDraft[]) => void;
}) {
  return (
    <div className="space-y-3">
      {splitForm.manualSpans.map((span, spanIndex) => (
        <div key={`${slotIndex}-${spanIndex}`} className="grid gap-2">
          <Input
            data-testid={`manual-split-start-${slotIndex}-${spanIndex}`}
            type="datetime-local"
            value={span.startTime}
            onChange={(event) =>
              onChange(
                splitForm.manualSpans.map((currentSpan, currentIndex) =>
                  currentIndex === spanIndex
                    ? { ...currentSpan, startTime: event.target.value }
                    : currentSpan,
                ),
              )
            }
          />
          <Input
            data-testid={`manual-split-end-${slotIndex}-${spanIndex}`}
            type="datetime-local"
            value={span.endTime}
            onChange={(event) =>
              onChange(
                splitForm.manualSpans.map((currentSpan, currentIndex) =>
                  currentIndex === spanIndex
                    ? { ...currentSpan, endTime: event.target.value }
                    : currentSpan,
                ),
              )
            }
          />
          <Input
            data-testid={`manual-split-label-${slotIndex}-${spanIndex}`}
            value={span.label}
            placeholder="Shift label"
            onChange={(event) =>
              onChange(
                splitForm.manualSpans.map((currentSpan, currentIndex) =>
                  currentIndex === spanIndex
                    ? { ...currentSpan, label: event.target.value }
                    : currentSpan,
                ),
              )
            }
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid={`add-manual-split-${slotIndex}`}
        onClick={() =>
          onChange([
            ...splitForm.manualSpans,
            { startTime: '', endTime: '', label: '' },
          ])
        }
      >
        Add manual span
      </Button>
    </div>
  );
}
