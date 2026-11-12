import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useParams,
} from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { AvailabilityStatusSection } from '@/features/scheduling/components/availability-status-section';
import {
  buildEventTimeBlockDayMarkers,
  filterEventTimeBlocksByName,
  filterEventTimeBlocksByTimeOfDay,
  type TimeWindowFilter,
} from '@/features/scheduling/components/participation-prepare.utils';
import { PrepareCalendar } from '@/features/scheduling/components/prepare/prepare-calendar';
import { PrepareEventTimeBlockList } from '@/features/scheduling/components/prepare/prepare-event-time-block-list';
import { PrepareFilters } from '@/features/scheduling/components/prepare/prepare-filters';
import { ScheduleAsk } from '@/features/scheduling/components/prepare/schedule-ask';
import { SchedulePublish } from '@/features/scheduling/components/prepare/schedule-publish';
import { swapRequestCountLabel } from '@/features/scheduling/components/prepare/schedule-rows';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

/**
 * The Schedule list stays mounted around its selected block: on desktop the
 * block editor opens in an in-flow panel beside the narrowed list (#853); on
 * narrow screens it replaces the list, which keeps its filters for the return.
 */
export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/_prepare',
)({
  component: PrepareWorkspaceRoute,
});

function PrepareWorkspaceRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const { timeSlotId: selectedBlockId } = useParams({ strict: false });
  const hash = useLocation({ select: (location) => location.hash });
  const { churchTimezone } = useTimezone();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState('');
  const [timeWindowFilter, setTimeWindowFilter] = useState<TimeWindowFilter>({
    mode: 'starts',
  });
  const schedules = useQuery({
    queryKey: ['prepare-schedules'],
    queryFn: () => adminApi.listSchedules(),
    retry: false,
  });
  const participation = useQuery({
    queryKey: ['prepare-cycle-participation', ministryId, cycleId],
    queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
    retry: false,
  });
  const schedule = schedules.data?.schedules.find(
    (row) => row.ministry.id === ministryId && row.cycle.id === cycleId,
  );
  const reads = [schedules, participation];
  const statuses = reads.map((read) =>
    isAxiosError(read.error) ? read.error.response?.status : undefined,
  );
  const notFound = statuses.includes(404) || (schedules.isSuccess && !schedule);
  const forbidden = statuses.includes(403);
  const failed = reads.some((read) => read.isError);
  const loading = reads.some((read) => read.isLoading);
  const events = participation.data?.events ?? [];
  const eventDayMarkers = buildEventTimeBlockDayMarkers({
    events,
    timeZone: churchTimezone,
  });
  const dayFiltered = selectedDate
    ? events
        .map((event) => ({
          ...event,
          eventTimeBlocks: event.eventTimeBlocks.filter(
            (block) =>
              dayOf({
                value: block.eventTimeBlock.startTime,
                timeZone: churchTimezone,
              }) === selectedDate,
          ),
        }))
        .filter((event) => event.eventTimeBlocks.length > 0)
    : events;
  const nameFiltered = filterEventTimeBlocksByName({
    events: dayFiltered,
    query: nameQuery,
  });
  const hasTimeBlocks = events.some(
    (event) => event.eventTimeBlocks.length > 0,
  );
  const filteredEvents = filterEventTimeBlocksByTimeOfDay({
    events: nameFiltered,
    filter: timeWindowFilter,
    timeZone: churchTimezone,
  });
  const pastCycle = schedule?.cycle.state === 'past';
  // A published Schedule asks no more, yet still prepares an added Event.
  const readOnly = pastCycle || schedule?.stage === 'published';
  // A failed background refetch keeps the loaded list, and an open block's
  // draft, mounted; only a read that never loaded replaces them.
  const loaded =
    schedules.data !== undefined && participation.data !== undefined;
  const ready = !notFound && !forbidden && !loading && loaded && schedule;
  const rowsReady = Boolean(ready);
  useEffect(() => {
    // A narrow screen hides the list until the block's match has closed.
    if (!rowsReady || !hash || selectedBlockId) return;
    // Router hash scrolling runs before query-loaded rows are mounted.
    const row = document.getElementById(hash);
    row?.scrollIntoView?.({ block: 'center' });
    // Closing or saving a block returns focus to its row (its trigger).
    row?.focus({ preventScroll: true });
  }, [hash, rowsReady, selectedBlockId]);
  const dateSpan = schedule
    ? `${formatCalendarDateOnly({ value: schedule.cycle.startDate })} – ${formatCalendarDateOnly({ value: schedule.cycle.endDate })}`
    : undefined;

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
            ? `${dateSpan} · ${m.prepare_schedule_description()}`
            : m.prepare_schedule_description()
        }
        autoFocusTitle
        className={selectedBlockId ? 'max-lg:hidden' : undefined}
        aside={
          ready ? (
            <div className="flex flex-wrap justify-end gap-2 [&_a]:min-h-11 md:[&_a]:min-h-0 [&_button]:min-h-11 md:[&_button]:min-h-0">
              <Link
                to="/schedules"
                data-testid="browse-all-cycles-link"
                className={buttonVariants({ variant: 'ghost' })}
              >
                {m.schedules_back()}
              </Link>
              {schedule.stage === 'published' ? (
                <Badge variant="secondary">
                  {schedule.affectedVolunteerCount > 0
                    ? m.schedules_unsent({
                        count: schedule.affectedVolunteerCount,
                      })
                    : m.schedules_published()}
                  {schedule.openSwapRequestCount > 0
                    ? ` · ${swapRequestCountLabel(schedule.openSwapRequestCount)}`
                    : null}
                </Badge>
              ) : null}
              {schedule.openSwapRequestCount > 0 ? (
                <Link
                  to="/schedules/$ministryId/$cycleId/assign"
                  params={{ ministryId, cycleId }}
                  data-testid="swap-requests-link"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  {m.schedules_swap_requests_link({
                    count: schedule.openSwapRequestCount,
                  })}
                </Link>
              ) : null}
              {schedule.stage === 'asking' ? (
                <Badge variant="secondary">{m.schedules_asking_stage()}</Badge>
              ) : null}
              {!readOnly && schedule.stage === 'to_prepare' ? (
                <ScheduleAsk ministryId={ministryId} cycleId={cycleId} />
              ) : null}
              {schedule.cycle.state !== 'past' &&
              (schedule.stage === 'asking' ||
                schedule.stage === 'assigning' ||
                schedule.stage === 'published') ? (
                <SchedulePublish ministryId={ministryId} cycleId={cycleId} />
              ) : null}
              <Link
                to="/schedules/$ministryId/$cycleId/assign"
                params={{ ministryId, cycleId }}
                data-testid="open-assign-link"
                className={buttonVariants({ variant: 'outline' })}
              >
                {m.prepare_open_builder()}
              </Link>
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
        <div role="status" aria-label={m.schedules_loading()}>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div
          className={cn(
            selectedBlockId &&
              'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6',
          )}
        >
          <div
            data-testid="prepare-workspace-stack"
            className={cn(
              // Filters lay out by this column's width, which a panel narrows.
              '@container flex flex-col gap-4',
              selectedBlockId && 'max-lg:hidden',
            )}
          >
            {schedule.stage === 'asking' ||
            schedule.stage === 'assigning' ||
            schedule.stage === 'published' ? (
              <AvailabilityStatusSection
                cycleId={cycleId}
                ministryId={ministryId}
                readOnly={readOnly}
              />
            ) : null}
            {failed && !selectedBlockId ? retryAlert : null}
            {pastCycle && !selectedBlockId ? (
              <Alert>
                <AlertDescription>
                  {m.prepare_block_read_only()}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="sticky top-4 z-10 flex flex-col gap-4 bg-background pb-4">
              <PrepareCalendar
                cycleStartDate={schedule.cycle.startDate}
                cycleEndDate={schedule.cycle.endDate}
                eventDayMarkers={eventDayMarkers}
                selectedDate={selectedDate}
                onSelectedDateChange={setSelectedDate}
              />
              <PrepareFilters
                nameQuery={nameQuery}
                onNameQueryChange={setNameQuery}
                timeWindowFilter={timeWindowFilter}
                onTimeWindowFilterChange={setTimeWindowFilter}
              />
            </div>
            {filteredEvents.some(
              (event) => event.eventTimeBlocks.length > 0,
            ) ? (
              <PrepareEventTimeBlockList
                events={filteredEvents}
                ministryId={ministryId}
                cycleId={cycleId}
              />
            ) : (
              <p
                role="status"
                data-testid="prepare-event-time-block-list-empty-state"
                className="py-8 text-center text-muted-foreground"
              >
                {hasTimeBlocks ? m.prepare_filter_empty() : m.prepare_empty()}
              </p>
            )}
          </div>
          {selectedBlockId ? (
            <div
              data-testid="prepare-block-panel"
              className="fade-in slide-in-from-right-8 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-card lg:p-6 lg:duration-300 lg:motion-safe:animate-in"
            >
              <Outlet />
            </div>
          ) : null}
        </div>
      )}
    </WorkspacePage>
  );
}
