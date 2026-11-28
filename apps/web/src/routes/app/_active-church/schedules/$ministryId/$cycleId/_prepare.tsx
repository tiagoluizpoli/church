import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  formatDayAndMonth,
  formatWeekdayShort,
  now,
  parseCalendarDay,
  parseTimeOfDay,
  today,
} from '@church/time';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useParams,
} from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion, usePresence } from 'framer-motion';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { AvailabilityStatusSection } from '@/features/scheduling/components/availability-status-section';
import type { TimeWindowFilter } from '@/features/scheduling/components/participation-prepare.utils';
import { InfoHint } from '@/features/scheduling/components/prepare/info-hint';
import { PrepareCalendar } from '@/features/scheduling/components/prepare/prepare-calendar';
import { PrepareEventTimeBlockList } from '@/features/scheduling/components/prepare/prepare-event-time-block-list';
import { PrepareFilters } from '@/features/scheduling/components/prepare/prepare-filters';
import { prepareParticipationQuery } from '@/features/scheduling/components/prepare/prepare-participation-query';
import { ScheduleAsk } from '@/features/scheduling/components/prepare/schedule-ask';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import { SchedulePublish } from '@/features/scheduling/components/prepare/schedule-publish';
import { scheduleStageLabel } from '@/features/scheduling/components/prepare/schedule-rows';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { useMediaQuery, XL_MEDIA_QUERY } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { SCHEDULE_TITLE_TRANSITION } from '@/shared/utils/view-transition-names';
import { adminApi } from '@/utils/api-instances';

const DUE_SOON_DAYS = 2;
const prepareSearchSchema = z.object({
  swapRequest: z.string().optional(),
  day: z.iso.date().optional().catch(undefined),
  q: z.string().optional(),
  timeMode: z.enum(['starts', 'ends', 'within']).optional().catch(undefined),
  timeFrom: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .catch(undefined),
  timeTo: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .catch(undefined),
  needsAttention: z.boolean().optional().catch(undefined),
  /** Opens Exportar, as the Event groups tab's way back does. */
  export: z.boolean().optional().catch(undefined),
});

/**
 * The Schedule list stays mounted around its selected block: on desktop the
 * block editor opens in an in-flow panel beside the narrowed list (#853); on
 * narrow screens it replaces the list, which keeps its filters for the return.
 */
export const Route = createFileRoute(
  '/app/_active-church/schedules/$ministryId/$cycleId/_prepare',
)({
  component: PrepareWorkspaceRoute,
  validateSearch: prepareSearchSchema,
});

function PrepareWorkspaceRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const { timeSlotId: selectedBlockId } = useParams({ strict: false });
  const hash = useLocation({ select: (location) => location.hash });
  const panel = useRef<HTMLDivElement>(null);
  const { churchTimezone } = useTimezone();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const selectedDate = search.day ?? null;
  const nameQuery = search.q ?? '';
  const needsAttention = search.needsAttention ?? false;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Stable while the URL's time filter is: the memoised filters skip route renders.
  const timeWindowFilter = useMemo<TimeWindowFilter>(
    () => ({
      mode: search.timeMode ?? 'starts',
      start: search.timeFrom
        ? parseTimeOfDay({ value: search.timeFrom })
        : undefined,
      end: search.timeTo ? parseTimeOfDay({ value: search.timeTo }) : undefined,
    }),
    [search.timeMode, search.timeFrom, search.timeTo],
  );
  // Stable setters: the memoised calendar, filters and list skip renders they don't need.
  const updateFilters = useCallback(
    (next: Partial<typeof search>) => {
      void navigate({
        // Stay where we are: a debounced name commit can land while a block is open
        // (or just after it closed), and must keep that block and its focus anchor.
        to: '.',
        search: (previous) => ({ ...previous, ...next }),
        hash: true,
        replace: true,
      });
    },
    [navigate],
  );
  const setSelectedDate = useCallback(
    (day: string | null) => updateFilters({ day: day ?? undefined }),
    [updateFilters],
  );
  const setNameQuery = useCallback(
    (q: string) => updateFilters({ q: q || undefined }),
    [updateFilters],
  );
  const setNeedsAttention = useCallback(
    (needsAttention: boolean) =>
      updateFilters({ needsAttention: needsAttention || undefined }),
    [updateFilters],
  );
  const setTimeWindowFilter = useCallback(
    (filter: TimeWindowFilter) =>
      updateFilters({
        timeMode: filter.mode,
        timeFrom: filter.start ?? undefined,
        timeTo: filter.end ?? undefined,
      }),
    [updateFilters],
  );
  function clearFilters() {
    updateFilters({
      day: undefined,
      q: undefined,
      timeMode: undefined,
      timeFrom: undefined,
      timeTo: undefined,
      needsAttention: undefined,
    });
  }
  const schedules = useSchedule({ ministryId, cycleId });
  const { filtered: hasActiveFilters, ...participationQuery } =
    prepareParticipationQuery({ ministryId, cycleId, search });
  const participation = useQuery({
    ...participationQuery,
    placeholderData: keepPreviousData,
  });
  const answers = useQuery({
    queryKey: ['availability-status', cycleId, ministryId],
    enabled:
      schedules.data !== undefined &&
      schedules.data.stage !== 'to_prepare' &&
      schedules.data.stage !== 'not_serving',
    queryFn: () =>
      adminApi.getCycleAvailabilityStatus(cycleId, { ministryId, limit: 1 }),
  });
  const schedule = schedules.data;
  const reads = [schedules, participation];
  const statuses = reads.map((read) =>
    isAxiosError(read.error) ? read.error.response?.status : undefined,
  );
  const notFound = statuses.includes(404) || (schedules.isSuccess && !schedule);
  const forbidden = statuses.includes(403);
  const failed = reads.some((read) => read.isError);
  const loading = reads.some((read) => read.isLoading);
  const events = participation.data?.events ?? [];
  const dayMarkers = participation.data?.dayMarkers;
  const eventDayMarkers = useMemo(
    () => new Set(dayMarkers ?? []),
    [dayMarkers],
  );
  const hasTimeBlocks = (participation.data?.totals.blocks ?? 0) > 0;
  const filteredEvents = events;
  const filteredBlockCount = events.reduce(
    (total, event) => total + event.eventTimeBlocks.length,
    0,
  );
  const activeFilterCount =
    Number(Boolean(selectedDate)) +
    Number(Boolean(nameQuery.trim())) +
    Number(Boolean(timeWindowFilter.start || timeWindowFilter.end)) +
    Number(needsAttention);
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const dueSoonDay = addCalendarDays({ day: churchDay, days: DUE_SOON_DAYS });
  const answerBy = answers.data?.answerBy;
  const pendingAnswers = answers.data
    ? answers.data.asked - answers.data.confirmed
    : 0;
  const deadlinePassed = Boolean(answerBy && answerBy < churchDay);
  const overdue = deadlinePassed && pendingAnswers > 0;
  const dueSoon = Boolean(
    answerBy &&
      answerBy <= dueSoonDay &&
      pendingAnswers > (answers.data?.asked ?? 0) / 2,
  );
  const pastCycle = schedule?.cycle.state === 'past';
  // A published Schedule asks no more, yet still prepares an added Event.
  const readOnly = pastCycle || schedule?.stage === 'published';
  // A failed background refetch keeps the loaded list, and an open block's
  // draft, mounted; only a read that never loaded replaces them.
  const loaded =
    schedules.data !== undefined && participation.data !== undefined;
  const ready = !notFound && !forbidden && !loading && loaded && schedule;
  usePanelStickyWhileItFits({
    panel,
    open: Boolean(selectedBlockId && ready),
  });
  const wide = useMediaQuery(XL_MEDIA_QUERY);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animateClose = wide && !reducedMotion;
  const blockPanel = selectedBlockId ? (
    <PreparePanel key="panel" panel={panel}>
      <Outlet />
    </PreparePanel>
  ) : null;
  const rowsReady = Boolean(ready);
  const selectedDay = selectedDate
    ? parseCalendarDay({ value: selectedDate })
    : null;
  const selectedDayLabel = selectedDay
    ? `${formatWeekdayShort({ day: selectedDay, locale: getLocale() })} ${formatDayAndMonth({ day: selectedDay })}`
    : null;
  const activeFilterLabels = [
    selectedDayLabel
      ? m.prepare_filter_day_selected({ day: selectedDayLabel })
      : null,
    nameQuery,
    timeWindowFilter.start,
    timeWindowFilter.end,
    needsAttention ? m.prepare_needs_attention_filter() : null,
  ]
    .filter(Boolean)
    .join(' · ');
  useEffect(() => {
    // A narrow screen hides the list until the block's match has closed.
    if (!rowsReady || !hash || selectedBlockId) return;
    // Router hash scrolling runs before query-loaded rows are mounted.
    const row = document.getElementById(hash);
    // 'nearest' honours the row's scroll margin, so the sticky mobile bar never covers it.
    row?.scrollIntoView?.({ block: 'nearest' });
    // Closing or saving a block returns focus to its row (its trigger).
    row?.focus({ preventScroll: true });
  }, [hash, rowsReady, selectedBlockId]);
  const dateSpan = schedule
    ? `${formatCalendarDateOnly({ value: schedule.cycle.startDate })} – ${formatCalendarDateOnly({ value: schedule.cycle.endDate })}`
    : undefined;

  const openSwapRequestCount = schedule?.openSwapRequestCount ?? 0;
  const stage = schedule?.stage;
  const exportRequested = search.export === true;
  // Back from the Event groups tab: the dialog opens once, then the URL forgets it.
  const forgetExportRequest = useCallback(() => {
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, export: undefined }),
      hash: true,
      replace: true,
    });
  }, [navigate]);
  // Memoised so the Respostas bar, which receives it, re-renders only when an action changes.
  const pageActions = useMemo(
    () =>
      stage ? (
        // No box of its own: these join the row they are placed in (the Respostas bar's actions).
        <div className="contents max-md:[&_a]:min-h-11 max-md:[&_a]:text-sm max-md:[&_button]:min-h-11 max-md:[&_button]:text-sm">
          {/* A Schedule with nothing live reads as `not_serving`; Ask says why it can't. */}
          {!readOnly && (stage === 'to_prepare' || stage === 'not_serving') ? (
            <ScheduleAsk ministryId={ministryId} cycleId={cycleId} />
          ) : null}
          {!pastCycle ? (
            <SchedulePublish
              ministryId={ministryId}
              cycleId={cycleId}
              unanswered={pendingAnswers}
            />
          ) : null}
          {openSwapRequestCount > 0 ? (
            <Link
              to="/app/schedules/$ministryId/$cycleId/assign"
              params={{ ministryId, cycleId }}
              data-testid="swap-requests-link"
              className={buttonVariants({ variant: 'outline' })}
            >
              {m.schedules_swap_requests_link({
                count: openSwapRequestCount,
              })}
            </Link>
          ) : null}
          {/* Never the primary: while answers are open the decision is remind or wait. */}
          <Link
            to="/app/schedules/$ministryId/$cycleId/assign"
            params={{ ministryId, cycleId }}
            data-testid="open-assign-link"
            className={buttonVariants({ variant: 'outline' })}
          >
            {m.prepare_open_builder()}
          </Link>
          <ScheduleExport
            ministryId={ministryId}
            cycleId={cycleId}
            initialOpen={exportRequested}
            onOpened={exportRequested ? forgetExportRequest : undefined}
          />
        </div>
      ) : null,
    [
      stage,
      readOnly,
      pastCycle,
      pendingAnswers,
      openSwapRequestCount,
      ministryId,
      cycleId,
      exportRequested,
      forgetExportRequest,
    ],
  );

  const coverageHint = useMemo(
    () =>
      stage === 'asking' || stage === 'assigning' ? (
        <InfoHint label={m.prepare_coverage_help_label()} withText>
          {m.prepare_coverage_help()}
        </InfoHint>
      ) : null,
    [stage],
  );

  const retryAlert = (
    <Alert variant="destructive" data-testid="prepare-retryable-error-state">
      <AlertDescription className="flex items-center gap-3">
        {m.prepare_schedule_error()}
        <Button
          variant="outline"
          onClick={() => {
            schedules.refetch();
            participation.refetch();
          }}
        >
          {m.schedules_retry()}
        </Button>
      </AlertDescription>
    </Alert>
  );

  return (
    <WorkspacePage data-testid="prepare-workspace-page">
      <WorkspaceIntroPanel
        title={
          schedule
            ? m.prepare_schedule_title({
                ministry: schedule.ministry.name,
                cycle: schedule.cycle.name,
              })
            : m.schedules_title()
        }
        description={
          dateSpan
            ? `${dateSpan} · ${schedule?.stage === 'asking' ? m.prepare_description_asking() : schedule?.stage === 'assigning' ? m.prepare_description_assigning() : schedule?.stage === 'published' ? m.prepare_description_published() : m.prepare_description_to_prepare()}`
            : m.prepare_schedule_description()
        }
        autoFocusTitle
        titleViewTransitionName={SCHEDULE_TITLE_TRANSITION}
        className={selectedBlockId ? 'max-xl:hidden' : undefined}
        aside={
          ready ? (
            <div className="flex flex-wrap gap-2 md:justify-end [&>div]:whitespace-nowrap [&>div]:max-sm:flex-1">
              <HeaderStatChip
                testId="prepare-stat-stage"
                label={m.prepare_stage_label()}
                value={scheduleStageLabel({
                  stage: schedule.stage,
                })}
              />
              {answers.data ? (
                <HeaderStatChip
                  testId="prepare-stat-answers"
                  label={m.answers_title()}
                  value={`${answers.data.confirmed}/${answers.data.asked}`}
                />
              ) : null}
              {/* Once published, the answer deadline no longer decides anything. */}
              {answers.data && schedule.stage !== 'published' ? (
                <HeaderStatChip
                  testId="prepare-stat-deadline"
                  label={m.answers_deadline()}
                  labelClassName={
                    overdue
                      ? 'text-destructive'
                      : dueSoon
                        ? 'text-amber-700 dark:text-amber-300'
                        : undefined
                  }
                  valueClassName={
                    overdue
                      ? 'text-destructive'
                      : dueSoon
                        ? 'text-amber-700 dark:text-amber-300'
                        : undefined
                  }
                  value={
                    answerBy
                      ? `${formatCalendarDateOnly({ value: answerBy })}${overdue ? ` · ${m.answers_overdue()}` : ''}`
                      : m.answers_no_deadline()
                  }
                />
              ) : null}
              {schedule.openSwapRequestCount > 0 ? (
                <HeaderStatChip
                  testId="prepare-stat-swaps"
                  label={m.prepare_swaps_label()}
                  value={schedule.openSwapRequestCount}
                />
              ) : null}
              {schedule.affectedVolunteerCount > 0 ? (
                <HeaderStatChip
                  testId="prepare-stat-unsent"
                  label={m.prepare_unsent_label()}
                  value={schedule.affectedVolunteerCount}
                />
              ) : null}
              {(participation.data?.totals.needsAttention ?? 0) > 0 ? (
                <button
                  type="button"
                  aria-pressed={needsAttention}
                  onClick={() => setNeedsAttention(!needsAttention)}
                  className="radius-surface min-h-11 text-left focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HeaderStatChip
                    testId="prepare-stat-attention"
                    label={m.prepare_attention_label()}
                    value={participation.data?.totals.needsAttention ?? 0}
                  />
                </button>
              ) : null}
            </div>
          ) : null
        }
      />
      {notFound ? (
        <Alert variant="destructive">
          <AlertDescription>{m.error_not_found()}</AlertDescription>
        </Alert>
      ) : forbidden ? (
        <Alert variant="destructive" data-testid="prepare-forbidden-state">
          <AlertDescription>{m.shell_no_access()}</AlertDescription>
        </Alert>
      ) : failed && !ready ? (
        retryAlert
      ) : !ready ? (
        <Pending label={m.schedules_loading()}>
          <div className="space-y-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-20 w-full" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </Pending>
      ) : (
        <>
          {/* Full width above the split: opening a block reflows nothing already read. */}
          <div className={cn(selectedBlockId && 'max-xl:hidden')}>
            {schedule.stage === 'asking' ||
            schedule.stage === 'assigning' ||
            schedule.stage === 'published' ? (
              <AvailabilityStatusSection
                cycleId={cycleId}
                ministryId={ministryId}
                readOnly={readOnly}
                headerSummary
                compact={schedule.stage === 'published'}
                trailing={pageActions}
              />
            ) : (
              // No Respostas bar yet: the actions take its place, flush right.
              <div className="flex flex-wrap items-center justify-end gap-2">
                {pageActions}
              </div>
            )}
          </div>
          <div
            className={cn(
              'relative',
              selectedBlockId &&
                // The list stays dominant; the editor gets a bounded column beside it.
                'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]',
            )}
          >
            <div
              data-testid="prepare-workspace-stack"
              className={cn(
                // Filters lay out by this column's width, which a panel narrows.
                '@container flex flex-col gap-4',
                selectedBlockId && 'max-xl:hidden',
              )}
            >
              {failed && !selectedBlockId ? retryAlert : null}
              {pastCycle && !selectedBlockId ? (
                <Alert>
                  <AlertDescription>
                    {m.prepare_block_read_only()}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                variant="outline"
                className="@lg:hidden min-h-11 justify-start text-sm"
                aria-expanded={filtersOpen}
                aria-controls="prepare-filter-controls"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                {activeFilterCount > 0
                  ? m.prepare_filters_toggle({ count: activeFilterCount })
                  : m.prepare_filters_toggle_none()}
              </Button>
              <div className={cn('@lg:block', !filtersOpen && 'hidden')}>
                <PrepareCalendar
                  cycleStartDate={schedule.cycle.startDate}
                  cycleEndDate={schedule.cycle.endDate}
                  eventDayMarkers={eventDayMarkers}
                  selectedDate={selectedDate}
                  onSelectedDateChange={setSelectedDate}
                />
              </div>
              <div
                className={cn(
                  'flex flex-col gap-2',
                  !filtersOpen && '@max-lg:hidden',
                )}
              >
                <div
                  id="prepare-filter-controls"
                  className={cn(
                    '@lg:block space-y-3',
                    !filtersOpen && 'hidden',
                  )}
                >
                  <PrepareFilters
                    needsAttention={needsAttention}
                    onNeedsAttentionChange={
                      needsAttention ||
                      (participation.data?.totals.needsAttention ?? 0) > 0
                        ? setNeedsAttention
                        : undefined
                    }
                    nameQuery={nameQuery}
                    onNameQueryChange={setNameQuery}
                    timeWindowFilter={timeWindowFilter}
                    onTimeWindowFilterChange={setTimeWindowFilter}
                    trailing={coverageHint}
                  />
                </div>
              </div>
              {hasActiveFilters ? (
                <div
                  role="status"
                  data-testid="prepare-filter-summary"
                  className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm"
                >
                  <span className="font-medium text-foreground">
                    {pluralMessage({
                      count: filteredBlockCount,
                      one: () => m.prepare_filtered_count_one(),
                      other: () =>
                        m.prepare_filtered_count_other({
                          count: filteredBlockCount,
                        }),
                    })}
                  </span>
                  <span>{activeFilterLabels}</span>
                  <Button
                    variant="ghost"
                    // The size of the status it sits in.
                    className="min-h-11 text-sm"
                    onClick={clearFilters}
                  >
                    {m.prepare_clear_filters()}
                  </Button>
                </div>
              ) : null}
              {filteredEvents.some(
                (event) => event.eventTimeBlocks.length > 0,
              ) ? (
                // The previous result stays while a new filter loads: dimmed, so it reads as stale.
                <div
                  aria-busy={participation.isPlaceholderData || undefined}
                  className={cn(
                    'transition-opacity',
                    participation.isPlaceholderData && 'opacity-60',
                  )}
                >
                  <PrepareEventTimeBlockList
                    events={filteredEvents}
                    selectedBlockId={selectedBlockId}
                    compact={Boolean(selectedBlockId)}
                    stage={schedule.stage}
                    pendingAnswers={pendingAnswers}
                    answersClosed={
                      schedule.stage === 'assigning' ||
                      schedule.stage === 'published' ||
                      deadlinePassed
                    }
                    ministryId={ministryId}
                    cycleId={cycleId}
                    foldElapsedWeeks={!hasActiveFilters}
                    cycleStart={parseCalendarDay({
                      value: schedule.cycle.startDate,
                    })}
                    cycleEnd={parseCalendarDay({
                      value: schedule.cycle.endDate,
                    })}
                  />
                </div>
              ) : (
                <p
                  role="status"
                  data-testid="prepare-event-time-block-list-empty-state"
                  className="py-8 text-center text-muted-foreground"
                >
                  {hasActiveFilters
                    ? m.prepare_filtered_description({
                        filters: activeFilterLabels,
                      })
                    : hasTimeBlocks
                      ? m.prepare_filter_empty()
                      : m.prepare_empty()}
                </p>
              )}
            </div>
            {/* Reduced motion, or a narrow screen: no exit, so no presence either (it unmounts at once). */}
            {animateClose ? (
              <AnimatePresence>{blockPanel}</AnimatePresence>
            ) : (
              blockPanel
            )}
          </div>
        </>
      )}
    </WorkspacePage>
  );
}

interface PanelStickyInput {
  panel: RefObject<HTMLDivElement | null>;
  open: boolean;
}

/** Beside the list the panel is sticky only while it fits the page's scroller; a taller one
 * scrolls with the page (its footer stays pinned to the scroller's bottom instead), so no
 * part of it is ever out of reach. Writes the style directly: no re-render. */
function usePanelStickyWhileItFits({ panel, open }: PanelStickyInput) {
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const scroller = element.closest('main');
    const fit = () => {
      const room = scroller?.clientHeight ?? window.innerHeight;
      element.style.position = element.offsetHeight > room ? 'static' : '';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, [panel, open]);
}

interface PreparePanelProps {
  panel: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/** The panel's slide, in and out alike. */
const PANEL_SLIDE_MS = 300;

/** The block panel. Inside AnimatePresence (beside the list, motion allowed) it is kept, empty
 * and inert, at its last size once its route is gone, while it slides out: the mirror of the
 * open animation. Outside it, presence is always true, so it unmounts at once. */
function PreparePanel({ panel, children }: PreparePanelProps) {
  const [present, safeToRemove] = usePresence();
  const size = useRef({ width: 0, height: 0 });
  useEffect(() => {
    if (present && panel.current)
      size.current = {
        width: panel.current.offsetWidth,
        height: panel.current.offsetHeight,
      };
  });
  return (
    <motion.div
      ref={panel}
      data-testid="prepare-block-panel"
      inert={!present}
      initial={false}
      exit={{
        opacity: 0,
        x: 32,
        transition: { duration: PANEL_SLIDE_MS / 1000 },
      }}
      onAnimationComplete={() => {
        if (!present) safeToRemove?.();
      }}
      style={{
        animationDuration: `${PANEL_SLIDE_MS}ms`,
        ...(!present && {
          width: size.current.width,
          minHeight: size.current.height,
        }),
      }}
      className={cn(
        // The house card from tablet up, as the table beside it; a phone gets the bare screen.
        'surface-panel max-md:rounded-none max-md:border-0 max-md:bg-none max-md:bg-transparent md:p-5 md:max-xl:max-w-2xl',
        // Beside the list it grows with its content, so only the page scrolls; it stays in view
        // while it fits the screen (usePanelStickyWhileItFits), and its footer sticks to the page's bottom.
        'fade-in slide-in-from-right-8 xl:sticky xl:top-0 xl:motion-safe:animate-in',
        // Leaving, its column is gone: it floats over where it was, at its measured size.
        !present && 'pointer-events-none absolute top-0 right-0',
      )}
    >
      {children}
    </motion.div>
  );
}
