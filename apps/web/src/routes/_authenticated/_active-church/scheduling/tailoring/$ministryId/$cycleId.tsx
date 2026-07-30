import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  buildSlotDayMarkers,
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
  toIsoString,
  validateManualSpans,
} from '@/features/scheduling/components/participation-tailoring.utils';
import { TailoringCalendar } from '@/features/scheduling/components/tailoring/tailoring-calendar';
import { TailoringFilters } from '@/features/scheduling/components/tailoring/tailoring-filters';
import {
  type HeadcountSave,
  type HeadcountSavesForShift,
  TailoringSlotList,
} from '@/features/scheduling/components/tailoring/tailoring-slot-list';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { toLocalDayKey } from '@/shared/utils/date';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/tailoring/$ministryId/$cycleId',
)({
  component: TailoringWorkspaceRoute,
});

interface StatChipProps {
  label: string;
  value: number;
  testId: string;
}

function StatChip({ label, value, testId }: StatChipProps) {
  return (
    <div className="px-3 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>{' '}
      <span className="font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Try again.';
}

interface SaveInclusionsParams {
  participationId: string;
  timeSlotId: string;
  timeSlotIds: string[];
}

interface SplitShiftsParams {
  participationId: string;
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}

interface SaveHeadcountsParams {
  participationId: string;
  timeSlotId: string;
  headcountSavesByShift: HeadcountSavesForShift[];
}

interface HeadcountSaveAttempt {
  shiftId: string;
  headcount: HeadcountSave;
}

interface SplitDirtySlotIdsParams {
  splitForms: Record<string, SplitFormState>;
  savedSplitForms: Record<string, SplitFormState>;
}

interface HeadcountDirtySlotIdsParams {
  events: GetCycleParticipation200EventsItem[];
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
}

function getSplitDirtySlotIds({
  splitForms,
  savedSplitForms,
}: SplitDirtySlotIdsParams): Set<string> {
  return new Set(
    Object.keys(splitForms).filter(
      (slotId) =>
        JSON.stringify(splitForms[slotId]) !==
        JSON.stringify(savedSplitForms[slotId]),
    ),
  );
}

function getHeadcountDirtySlotIds({
  events,
  headcountDrafts,
  savedHeadcountDrafts,
}: HeadcountDirtySlotIdsParams): Set<string> {
  const dirtySlotIds = new Set<string>();

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      const shiftIds = new Set(slotView.shifts.map((shift) => shift.id));
      const keys = new Set([
        ...Object.keys(headcountDrafts),
        ...Object.keys(savedHeadcountDrafts),
      ]);
      const hasDirtyDraft = [...keys].some((key) => {
        const [shiftId] = key.split(':');
        return (
          shiftIds.has(shiftId) &&
          headcountDrafts[key] !== savedHeadcountDrafts[key]
        );
      });

      if (hasDirtyDraft) dirtySlotIds.add(slotView.slot.id);
    }
  }

  return dirtySlotIds;
}

interface EditSessionState {
  splitForms: Record<string, SplitFormState>;
  savedSplitForms: Record<string, SplitFormState>;
  headcountDrafts: Record<string, string>;
  savedHeadcountDrafts: Record<string, string>;
  /** Session-scoped, not persisted — every `MinistryParticipation` touched
   * by a successful inclusion/split/headcount edit since the workspace was
   * opened. Drives both the unsaved-changes navigation blocker (R8) and the
   * batched "Save & request availability" action (R4). */
  touchedParticipationIds: Set<string>;
}

const initialEditSessionState: EditSessionState = {
  splitForms: {},
  savedSplitForms: {},
  headcountDrafts: {},
  savedHeadcountDrafts: {},
  touchedParticipationIds: new Set(),
};

interface SavedHeadcountEntry {
  key: string;
  value: string;
}

type EditSessionAction =
  | {
      type: 'initialized';
      splitForms: Record<string, SplitFormState>;
      headcountDrafts: Record<string, string>;
    }
  | {
      type: 'split-form-changed';
      timeSlotId: string;
      nextForm: SplitFormState;
    }
  | { type: 'headcount-draft-changed'; key: string; value: string }
  | { type: 'inclusion-saved'; participationId: string }
  | { type: 'split-saved'; participationId: string; slotId: string }
  | {
      type: 'headcounts-saved';
      participationId: string;
      savedHeadcounts: SavedHeadcountEntry[];
    }
  | { type: 'availability-sent' };

/** These five pieces of state all change together across the same
 * save/dirty lifecycle (draft edits → per-slot save → touched-for-batch),
 * so they're modeled as one reducer instead of five independent `useState`
 * calls whose updates would otherwise need to stay manually in sync across
 * every mutation's `onSuccess`. `selectedDate`/`nameQuery`/`timeWindowFilter`/
 * `confirmSendOpen` stay outside this reducer — they're genuinely
 * independent UI state, not part of the edit session. */
function editSessionReducer(
  state: EditSessionState,
  action: EditSessionAction,
): EditSessionState {
  switch (action.type) {
    case 'initialized':
      return {
        ...state,
        splitForms: action.splitForms,
        savedSplitForms: action.splitForms,
        headcountDrafts: action.headcountDrafts,
        savedHeadcountDrafts: action.headcountDrafts,
      };
    case 'split-form-changed':
      return {
        ...state,
        splitForms: {
          ...state.splitForms,
          [action.timeSlotId]: action.nextForm,
        },
      };
    case 'headcount-draft-changed':
      return {
        ...state,
        headcountDrafts: {
          ...state.headcountDrafts,
          [action.key]: action.value,
        },
      };
    case 'inclusion-saved':
      return {
        ...state,
        touchedParticipationIds: new Set([
          ...state.touchedParticipationIds,
          action.participationId,
        ]),
      };
    case 'split-saved':
      return {
        ...state,
        savedSplitForms: {
          ...state.savedSplitForms,
          [action.slotId]: state.splitForms[action.slotId],
        },
        touchedParticipationIds: new Set([
          ...state.touchedParticipationIds,
          action.participationId,
        ]),
      };
    case 'headcounts-saved':
      if (action.savedHeadcounts.length === 0) return state;
      return {
        ...state,
        savedHeadcountDrafts: {
          ...state.savedHeadcountDrafts,
          ...Object.fromEntries(
            action.savedHeadcounts.map(({ key, value }) => [key, value]),
          ),
        },
        touchedParticipationIds: new Set([
          ...state.touchedParticipationIds,
          action.participationId,
        ]),
      };
    case 'availability-sent':
      return { ...state, touchedParticipationIds: new Set() };
    default:
      return state;
  }
}

function TailoringWorkspaceRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [timeWindowFilter, setTimeWindowFilter] = useState<TimeWindowFilter>({
    mode: 'starts',
  });
  const [editSession, dispatchEditSession] = useReducer(
    editSessionReducer,
    initialEditSessionState,
  );
  const {
    splitForms,
    savedSplitForms,
    headcountDrafts,
    savedHeadcountDrafts,
    touchedParticipationIds,
  } = editSession;
  const initializedWorkspaceKey = useRef<string | null>(null);

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
    const workspaceKey = `${ministryId}:${cycleId}`;
    if (initializedWorkspaceKey.current === workspaceKey) return;
    initializedWorkspaceKey.current = workspaceKey;
    const initialSplitForms = createInitialSplitForms(
      participationQuery.data.events,
    );
    const initialHeadcountDrafts = createInitialHeadcountDrafts(
      participationQuery.data.events,
    );
    dispatchEditSession({
      type: 'initialized',
      splitForms: initialSplitForms,
      headcountDrafts: initialHeadcountDrafts,
    });
  }, [cycleId, ministryId, participationQuery.data]);

  const splitDirtySlotIds = useMemo(
    () => getSplitDirtySlotIds({ splitForms, savedSplitForms }),
    [savedSplitForms, splitForms],
  );
  const headcountDirtySlotIds = useMemo(
    () =>
      getHeadcountDirtySlotIds({
        events,
        headcountDrafts,
        savedHeadcountDrafts,
      }),
    [events, headcountDrafts, savedHeadcountDrafts],
  );

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
      dispatchEditSession({ type: 'inclusion-saved', participationId });
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
        return { participationId, slotId: slotView.slot.id };
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
      return { participationId, slotId: slotView.slot.id };
    },
    onSuccess: async ({ participationId, slotId }) => {
      toast.success('Shifts updated.');
      dispatchEditSession({ type: 'split-saved', participationId, slotId });
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveHeadcounts = useMutation({
    mutationFn: async ({
      participationId,
      timeSlotId,
      headcountSavesByShift,
    }: SaveHeadcountsParams) => {
      const attempts: HeadcountSaveAttempt[] = headcountSavesByShift.flatMap(
        ({ shiftId, validHeadcounts }) =>
          validHeadcounts.map((headcount) => ({ shiftId, headcount })),
      );
      const results = await Promise.allSettled(
        attempts.map(({ shiftId, headcount }) =>
          adminApi.upsertShiftRequirement(shiftId, {
            roleId: headcount.roleId,
            teamId: headcount.teamId,
            requiredCount: headcount.requiredCount,
          }),
        ),
      );
      const savedHeadcounts = attempts.filter(
        (_attempt, index) => results[index]?.status === 'fulfilled',
      );
      return {
        participationId,
        timeSlotId,
        savedHeadcounts,
        failedCount: attempts.length - savedHeadcounts.length,
      };
    },
    onSuccess: async ({ participationId, savedHeadcounts, failedCount }) => {
      dispatchEditSession({
        type: 'headcounts-saved',
        participationId,
        savedHeadcounts: savedHeadcounts.map(({ shiftId, headcount }) => ({
          key: toHeadcountKey(shiftId, headcount.roleId),
          value: String(headcount.requiredCount),
        })),
      });
      if (failedCount > 0) {
        toast.error('Some headcounts could not be saved. Try again.');
      } else {
        toast.success('Headcounts saved.');
      }
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
      dispatchEditSession({ type: 'availability-sent' });
      await refreshParticipation();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const hasUnsavedDraftEdits =
    splitDirtySlotIds.size > 0 || headcountDirtySlotIds.size > 0;
  const hasUnsentChanges = touchedParticipationIds.size > 0;
  const isDirty = hasUnsentChanges || hasUnsavedDraftEdits;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  });

  const eventDayMarkers = buildSlotDayMarkers({ events });

  const dayFiltered = selectedDate
    ? events
        .map((eventView) => ({
          ...eventView,
          slots: eventView.slots.filter(
            (slotView) =>
              toLocalDayKey(slotView.slot.startTime) === selectedDate,
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
  const touchedEventTitles = events
    .filter((eventView) =>
      touchedParticipationIds.has(eventView.participation.id),
    )
    .map((eventView) => eventView.event.title);
  const cycleDateSpan = cycleQuery.data
    ? `${formatDate(cycleQuery.data.cycle.startDate)} – ${formatDate(cycleQuery.data.cycle.endDate)}`
    : null;

  return (
    <WorkspacePage data-testid="tailoring-workspace-page">
      <WorkspaceIntroPanel
        title={
          ministryName && cycleQuery.data
            ? `${ministryName} · ${cycleQuery.data.cycle.name}`
            : 'Rostering workspace'
        }
        description={
          cycleDateSpan
            ? `${cycleDateSpan} · Filter to a day, confirm slots, split shifts, and set headcounts.`
            : 'Filter to a day, confirm slots, split shifts, and set headcounts.'
        }
        autoFocusTitle
        aside={
          !isLoading && !errorKind ? (
            <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto xl:justify-end">
              <div className="radius-surface flex divide-x divide-border/70 border border-border/70 bg-background/70 text-sm">
                <StatChip
                  label="Events"
                  value={eventCount}
                  testId="tailoring-event-count"
                />
                <StatChip
                  label="Slots"
                  value={includedSlotCount}
                  testId="tailoring-included-count"
                />
                <StatChip
                  label="Shifts"
                  value={shiftCount}
                  testId="tailoring-shift-count"
                />
                {hasUnsentChanges ? (
                  <StatChip
                    label="Unsent"
                    value={touchedParticipationIds.size}
                    testId="tailoring-touched-count"
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/scheduling/tailoring/$ministryId"
                  params={{ ministryId }}
                  search={{ browse: true }}
                  data-testid="browse-all-cycles-link"
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  Browse cycles
                </Link>
                <Link
                  to="/scheduling/rostering/$ministryId/$cycleId"
                  params={{ ministryId, cycleId }}
                  data-testid="open-assign-link"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Open builder
                </Link>
                <Button
                  type="button"
                  className="disabled:opacity-40 dark:disabled:opacity-30"
                  data-testid="save-and-fire-availability-button"
                  disabled={
                    !hasUnsentChanges || saveAndFireAvailability.isPending
                  }
                  onClick={() => {
                    if (saveAndFireAvailability.isPending) return;
                    setConfirmSendOpen(true);
                  }}
                >
                  {saveAndFireAvailability.isPending
                    ? 'Sending…'
                    : 'Request availability'}
                </Button>
              </div>
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
        <div data-testid="tailoring-workspace-stack" className="space-y-4">
          <div className="sticky top-4 z-10 space-y-4 bg-background pb-4">
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
            savedHeadcountDrafts={savedHeadcountDrafts}
            splitDirtySlotIds={splitDirtySlotIds}
            headcountDirtySlotIds={headcountDirtySlotIds}
            pendingHeadcountSlotId={
              saveHeadcounts.isPending
                ? (saveHeadcounts.variables?.timeSlotId ?? null)
                : null
            }
            pendingSplitSlotId={
              splitShifts.isPending
                ? (splitShifts.variables?.slotView.slot.id ?? null)
                : null
            }
            pendingInclusionSlotId={
              saveInclusions.isPending
                ? (saveInclusions.variables?.timeSlotId ?? null)
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

              saveInclusions.mutate({
                participationId,
                timeSlotId,
                timeSlotIds: nextIncluded,
              });
            }}
            onSplitFormChange={({ timeSlotId, nextForm }) =>
              dispatchEditSession({
                type: 'split-form-changed',
                timeSlotId,
                nextForm,
              })
            }
            onSplitShifts={({ participationId, slotView }) =>
              splitShifts.mutate({ participationId, slotView })
            }
            onHeadcountChange={({ shiftId, roleId, value }) =>
              dispatchEditSession({
                type: 'headcount-draft-changed',
                key: toHeadcountKey(shiftId, roleId),
                value,
              })
            }
            onSaveHeadcounts={({
              participationId,
              timeSlotId,
              headcountSavesByShift,
            }) =>
              saveHeadcounts.mutate({
                participationId,
                timeSlotId,
                headcountSavesByShift,
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
              {hasUnsavedDraftEdits
                ? 'You have unsaved shift-split or headcount changes. Leaving now will discard them.'
                : "You've touched slots or shifts in this session but haven't sent availability requests yet. Leaving now won't notify volunteers of these changes."}
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

      <AlertDialog open={confirmSendOpen}>
        <AlertDialogContent data-testid="tailoring-send-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send {touchedEventTitles.length}{' '}
              {touchedEventTitles.length === 1
                ? 'availability request'
                : 'availability requests'}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Volunteers for the following{' '}
              {touchedEventTitles.length === 1 ? 'event' : 'events'} will be
              notified. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-40 list-inside list-disc overflow-y-auto text-foreground text-sm">
            {touchedEventTitles.map((title, index) => (
              <li key={`${title}-${index}`} className="wrap-break-word">
                {title}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="tailoring-send-cancel"
              onClick={() => setConfirmSendOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="tailoring-send-confirm"
              onClick={() => {
                setConfirmSendOpen(false);
                saveAndFireAvailability.mutate();
              }}
            >
              Send {touchedEventTitles.length}{' '}
              {touchedEventTitles.length === 1 ? 'request' : 'requests'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspacePage>
  );
}
