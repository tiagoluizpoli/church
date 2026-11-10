import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { z } from 'zod';
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
import { swapRequestCountLabel } from '@/features/scheduling/components/prepare/schedules-list-page';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

/** The id an N7 swap request alert (bell or email) deep-links with. */
const prepareSearchSchema = z.object({ swapRequest: z.string().optional() });

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/',
)({
  validateSearch: prepareSearchSchema,
  component: PrepareWorkspaceRoute,
});

function PrepareWorkspaceRoute() {
  const { ministryId, cycleId } = Route.useParams();
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
  const ready = !notFound && !forbidden && !failed && !loading && schedule;
  const rowsReady = Boolean(ready);
  useEffect(() => {
    if (!rowsReady || !hash) return;
    // Router hash scrolling runs before query-loaded rows are mounted.
    document.getElementById(hash)?.scrollIntoView?.({ block: 'center' });
  }, [hash, rowsReady]);
  const dateSpan = schedule
    ? `${formatCalendarDateOnly({ value: schedule.cycle.startDate })} – ${formatCalendarDateOnly({ value: schedule.cycle.endDate })}`
    : undefined;

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
        aside={
          ready ? (
            <div className="flex flex-wrap gap-2">
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
      ) : failed ? (
        <Alert
          variant="destructive"
          data-testid="prepare-retryable-error-state"
        >
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
      ) : !ready ? (
        <div role="status" aria-label={m.schedules_loading()}>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div
          data-testid="prepare-workspace-stack"
          className="flex flex-col gap-4"
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
          {pastCycle ? (
            <Alert>
              <AlertDescription>{m.prepare_block_read_only()}</AlertDescription>
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
          {filteredEvents.some((event) => event.eventTimeBlocks.length > 0) ? (
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
      )}
    </WorkspacePage>
  );
}
