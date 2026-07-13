import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import {
  buildEventDayMarkers,
  classifyTailoringFetchError,
  countIncludedSlots,
  countShifts,
  createInitialHeadcountDrafts,
  createInitialSplitForms,
  filterSlotsByName,
  filterSlotsByTimeOfDay,
  formatDate,
  type SplitFormState,
  type TimeWindowFilter,
  toHeadcountKey,
  toIsoDateString,
  toIsoString,
  validateManualSpans,
} from '@/features/scheduling/components/participation-tailoring.utils';
import { TailoringCalendar } from '@/features/scheduling/components/tailoring/tailoring-calendar';
import { TailoringFilters } from '@/features/scheduling/components/tailoring/tailoring-filters';
import {
  type HeadcountSave,
  TailoringSlotList,
} from '@/features/scheduling/components/tailoring/tailoring-slot-list';
import type { GetCycleParticipation200EventsItemSlotsItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/scheduling/tailoring/$ministryId/$cycleId',
)({
  component: TailoringWorkspaceRoute,
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

interface SaveInclusionsParams {
  participationId: string;
  timeSlotIds: string[];
}

interface SplitShiftsParams {
  participationId: string;
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}

interface SaveHeadcountsParams {
  participationId: string;
  shiftId: string;
  validHeadcounts: HeadcountSave[];
}

function TailoringWorkspaceRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState('');
  const [timeWindowFilter, setTimeWindowFilter] = useState<TimeWindowFilter>({
    mode: 'starts',
  });
  const [splitForms, setSplitForms] = useState<Record<string, SplitFormState>>(
    {},
  );
  const [headcountDrafts, setHeadcountDrafts] = useState<
    Record<string, string>
  >({});
  /** Session-scoped, not persisted — every `MinistryParticipation` touched by
   * a successful inclusion/split/headcount edit since the workspace was
   * opened. Drives both the unsaved-changes navigation blocker (R8) and the
   * batched "Save & request availability" action (R4). */
  const [touchedParticipationIds, setTouchedParticipationIds] = useState<
    Set<string>
  >(new Set());
  const markTouched = (participationId: string) =>
    setTouchedParticipationIds(
      (current) => new Set([...current, participationId]),
    );

  const cycleQuery = useQuery({
    queryKey: ['tailoring-cycle', cycleId],
    queryFn: () => adminApi.getPlanningCycle(cycleId),
    retry: false,
  });

  const ministriesQuery = useQuery({
    queryKey: ['tailoring-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const ministryName = ministriesQuery.data?.ministries.find(
    (ministry) => ministry.id === ministryId,
  )?.name;

  const participationQuery = useQuery({
    queryKey: ['tailoring-cycle-participation', ministryId, cycleId],
    queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
    retry: false,
  });
  const events = participationQuery.data?.events ?? [];

  useEffect(() => {
    if (!participationQuery.data) return;
    setSplitForms(createInitialSplitForms(participationQuery.data.events));
    setHeadcountDrafts(
      createInitialHeadcountDrafts(participationQuery.data.events),
    );
  }, [participationQuery.data]);

  const refreshParticipation = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['tailoring-cycle-participation', ministryId, cycleId],
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
      return { participationId };
    },
    onSuccess: async ({ participationId }) => {
      markTouched(participationId);
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const splitShifts = useMutation({
    mutationFn: async ({ participationId, slotView }: SplitShiftsParams) => {
      const form = splitForms[slotView.slot.id];
      if (!form) throw new Error('Split form is missing.');

      if (form.mode === 'equal') {
        const count = Number.parseInt(form.equalCount, 10);
        if (!Number.isInteger(count) || count < 1) {
          throw new Error('Equal split count must be 1 or greater.');
        }

        await adminApi.splitParticipationShifts(
          participationId,
          slotView.slot.id,
          { strategy: { kind: 'equal-n', n: count } },
        );
        return { participationId };
      }

      const error = validateManualSpans({ slotView, spans: form.manualSpans });
      if (error) throw new Error(error);

      await adminApi.splitParticipationShifts(
        participationId,
        slotView.slot.id,
        {
          strategy: {
            kind: 'manual',
            spans: form.manualSpans.map((span) => ({
              startTime: toIsoString(span.startTime),
              endTime: toIsoString(span.endTime),
              label: span.label || undefined,
            })),
          },
        },
      );
      return { participationId };
    },
    onSuccess: async ({ participationId }) => {
      toast.success('Shifts updated.');
      markTouched(participationId);
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveHeadcounts = useMutation({
    mutationFn: async ({
      participationId,
      shiftId,
      validHeadcounts,
    }: SaveHeadcountsParams) => {
      await Promise.all(
        validHeadcounts.map((headcount) =>
          adminApi.upsertShiftRequirement(shiftId, {
            roleId: headcount.roleId,
            teamId: headcount.teamId,
            requiredCount: headcount.requiredCount,
          }),
        ),
      );
      return { participationId };
    },
    onSuccess: async ({ participationId }) => {
      toast.success('Headcounts saved.');
      markTouched(participationId);
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  /** One explicit save/publish action per visit: fires `fireAvailability`
   * once per touched participation still in `tailoring` state, reusing
   * `resendAvailabilityReminder` for participations already past it (FR-017)
   * — remains available and re-invocable after schedule release, and never
   * blocks further edits. Server-side `AvailabilityCheck` dedup (R4) means a
   * duplicate call from resaving after a mid-flight navigation is harmless. */
  const saveAndFireAvailability = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(
        [...touchedParticipationIds].map((participationId) => {
          const eventView = events.find(
            (candidate) => candidate.participation.id === participationId,
          );
          return eventView?.participation.state === 'tailoring'
            ? adminApi.fireAvailability(participationId)
            : adminApi.resendAvailabilityReminder(participationId);
        }),
      );
      return results;
    },
    onSuccess: async () => {
      toast.success('Availability requests sent.');
      setTouchedParticipationIds(new Set());
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const isDirty = touchedParticipationIds.size > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

  const eventDayMarkers = buildEventDayMarkers({
    events: events.map((eventView) => eventView.event),
  });

  const dayFiltered = selectedDate
    ? events
        .map((eventView) => ({
          ...eventView,
          slots: eventView.slots.filter(
            (slotView) =>
              toIsoDateString(new Date(slotView.slot.startTime)) ===
              selectedDate,
          ),
        }))
        .filter((eventView) => eventView.slots.length > 0)
    : events;
  const nameFiltered = filterSlotsByName({
    events: dayFiltered,
    query: nameQuery,
  });
  const filteredEvents = filterSlotsByTimeOfDay({
    events: nameFiltered,
    filter: timeWindowFilter,
  });

  const isLoading =
    cycleQuery.isLoading ||
    ministriesQuery.isLoading ||
    participationQuery.isLoading;

  const failedQuery = [cycleQuery, ministriesQuery, participationQuery].find(
    (query) => query.isError,
  );
  const errorKind = failedQuery
    ? classifyTailoringFetchError({ error: failedQuery.error })
    : null;

  const retryAll = () => {
    cycleQuery.refetch();
    ministriesQuery.refetch();
    participationQuery.refetch();
  };

  const includedSlotCount = countIncludedSlots(events);
  const shiftCount = countShifts(events);
  const eventCount = events.length;
  const cycleDateSpan = cycleQuery.data
    ? `${formatDate(cycleQuery.data.cycle.startDate)} – ${formatDate(cycleQuery.data.cycle.endDate)}`
    : null;

  return (
    <WorkspacePage data-testid="tailoring-workspace-page">
      <WorkspaceIntroPanel
        title={
          ministryName && cycleQuery.data
            ? `${ministryName} · ${cycleQuery.data.cycle.name}`
            : 'Tailoring workspace'
        }
        description={
          cycleDateSpan
            ? `${cycleDateSpan} · Filter to a day, confirm slots, split shifts, and set headcounts.`
            : 'Filter to a day, confirm slots, split shifts, and set headcounts.'
        }
        autoFocusTitle
        aside={
          !isLoading && !errorKind ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Events</span>{' '}
                <span
                  className="font-medium"
                  data-testid="tailoring-event-count"
                >
                  {eventCount}
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
              {isDirty ? (
                <div
                  className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
                  data-testid="tailoring-touched-count"
                >
                  <span className="text-muted-foreground text-xs">Touched</span>{' '}
                  <span className="font-medium">
                    {touchedParticipationIds.size}
                  </span>
                </div>
              ) : null}
              <Link
                to="/scheduling/builder-events"
                search={{ ministryId }}
                data-testid="open-builder-link"
                className={buttonVariants({ variant: 'outline' })}
              >
                Open builder
              </Link>
              <Button
                type="button"
                className="disabled:opacity-40 dark:disabled:opacity-30"
                data-testid="save-and-fire-availability-button"
                disabled={!isDirty || saveAndFireAvailability.isPending}
                onClick={() => {
                  if (saveAndFireAvailability.isPending) return;
                  saveAndFireAvailability.mutate();
                }}
              >
                {saveAndFireAvailability.isPending
                  ? 'Sending…'
                  : 'Request availability'}
              </Button>
            </div>
          ) : null
        }
      />

      {errorKind === 'forbidden' ? (
        <Alert variant="destructive" data-testid="tailoring-forbidden-state">
          <AlertTitle>You don't have access to this workspace</AlertTitle>
          <AlertDescription>
            Ask a church admin to grant you leader or sub-leader access.
          </AlertDescription>
        </Alert>
      ) : errorKind === 'retryable' ? (
        <Alert
          variant="destructive"
          data-testid="tailoring-retryable-error-state"
        >
          <AlertTitle>Couldn't load this workspace</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Check your connection and try again.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={retryAll}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading || !cycleQuery.data ? (
        <div className="grid gap-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.6fr)_minmax(0,1.4fr)] lg:items-start">
          <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <TailoringCalendar
              cycleStartDate={cycleQuery.data.cycle.startDate}
              cycleEndDate={cycleQuery.data.cycle.endDate}
              eventDayMarkers={eventDayMarkers}
              selectedDate={selectedDate}
              onSelectedDateChange={setSelectedDate}
            />
            <TailoringFilters
              nameQuery={nameQuery}
              onNameQueryChange={setNameQuery}
              timeWindowFilter={timeWindowFilter}
              onTimeWindowFilterChange={setTimeWindowFilter}
            />
          </div>

          <TailoringSlotList
            events={filteredEvents}
            ministryId={ministryId}
            splitForms={splitForms}
            headcountDrafts={headcountDrafts}
            pendingHeadcountShiftId={
              saveHeadcounts.isPending
                ? (saveHeadcounts.variables?.shiftId ?? null)
                : null
            }
            pendingSplitSlotId={
              splitShifts.isPending
                ? (splitShifts.variables?.slotView.slot.id ?? null)
                : null
            }
            onToggleInclusion={({ participationId, timeSlotId, checked }) => {
              const participationEvents = events.find(
                (eventView) => eventView.participation.id === participationId,
              );
              const currentIncluded = (participationEvents?.slots ?? [])
                .filter((slotView) => slotView.included)
                .map((slotView) => slotView.slot.id);
              const nextIncluded = checked
                ? [...new Set([...currentIncluded, timeSlotId])]
                : currentIncluded.filter((id) => id !== timeSlotId);

              if (!checked) {
                setSplitForms((current) => {
                  const { [timeSlotId]: _removed, ...rest } = current;
                  return rest;
                });
              }

              saveInclusions.mutate({
                participationId,
                timeSlotIds: nextIncluded,
              });
            }}
            onSplitFormChange={({ timeSlotId, nextForm }) =>
              setSplitForms((current) => ({
                ...current,
                [timeSlotId]: nextForm,
              }))
            }
            onSplitShifts={({ participationId, slotView }) =>
              splitShifts.mutate({ participationId, slotView })
            }
            onHeadcountChange={({ shiftId, roleId, value }) =>
              setHeadcountDrafts((current) => ({
                ...current,
                [toHeadcountKey(shiftId, roleId)]: value,
              }))
            }
            onSaveHeadcounts={({ participationId, shiftId, validHeadcounts }) =>
              saveHeadcounts.mutate({
                participationId,
                shiftId,
                validHeadcounts,
              })
            }
          />
        </div>
      )}

      <AlertDialog open={blocker.status === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You've touched slots or shifts in this session but haven't sent
              availability requests yet. Leaving now won't notify volunteers of
              these changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="tailoring-leave-cancel"
              onClick={() => blocker.reset?.()}
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="tailoring-leave-confirm"
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspacePage>
  );
}
