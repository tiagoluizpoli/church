import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useOnlineState } from '../hooks/use-online-state';
import {
  assignmentDayLabel,
  relativeDayName,
} from '../lib/assignment-day-label';
import { cachedReadOptions, fetchAndCache } from '../lib/my-schedule-cache';
import { cachedMinistryScheduleSchema } from '../lib/my-schedule-schemas';
import { MyScheduleBackLink } from './my-schedule-back-link';
import { CancelledBadge } from '@/components/cancelled-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetMinistrySchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatTimeOf } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

export interface MyMinistrySchedulePageProps {
  ministryId: string;
  cycleId: string;
}

type ScheduleRow = GetMinistrySchedule200['events'][number]['rows'][number];

/** The page's read; the breadcrumb hook observes the same key. */
export const myMinistryScheduleKey = ({
  ministryId,
  cycleId,
}: MyMinistrySchedulePageProps) =>
  ['my-ministry-schedule', ministryId, cycleId] as const;

interface EventWhenInput {
  start: string;
  end: string;
  timeZone: string;
}

/** `Sun 22 Nov · 18:00–20:00`, the day and time format of My schedule. */
function eventWhen({ start, end, timeZone }: EventWhenInput): string {
  const day =
    relativeDayName({ startTime: start, timeZone }) ??
    assignmentDayLabel({ startTime: start, timeZone });
  return `${day} · ${formatTimeOf({ value: start, timeZone })}–${formatTimeOf({ value: end, timeZone })}`;
}

const STRUCK = 'text-muted-foreground line-through';

interface ShiftGroup {
  label: string;
  cancelled: boolean;
  rows: ScheduleRow[];
}

function groupByShift(rows: ScheduleRow[]) {
  const shifts = new Map<string, ShiftGroup>();
  for (const row of rows) {
    const shift = shifts.get(row.shiftId) ?? {
      label: row.shiftLabel,
      cancelled: row.cancelled,
      rows: [],
    };
    shift.rows.push(row);
    shifts.set(row.shiftId, shift);
  }
  return [...shifts.entries()];
}

export function MyMinistrySchedulePage({
  ministryId,
  cycleId,
}: MyMinistrySchedulePageProps) {
  const { churchTimezone } = useTimezone();
  const isOnline = useOnlineState();
  const cacheKey = `ministry-schedule:${ministryId}:${cycleId}`;
  const callerScope = useCallerCapabilitiesScope();
  const { churchId = null, userId = null } = callerScope ?? {};
  const cacheScope = churchId && userId ? { userId, churchId } : null;
  const query = useQuery({
    queryKey: myMinistryScheduleKey({ ministryId, cycleId }),
    queryFn: () =>
      fetchAndCache({
        scope: cacheScope,
        key: cacheKey,
        fetch: () => volunteerApi.getMinistrySchedule(ministryId, { cycleId }),
      }),
    ...cachedReadOptions({
      scope: cacheScope,
      key: cacheKey,
      isOnline,
      schema: cachedMinistryScheduleSchema,
    }),
  });

  if (query.isPending) {
    return (
      <Pending label={m.my_schedule_ministry_loading()}>
        <Skeleton className="h-40 w-full" />
      </Pending>
    );
  }
  // Retained data stays on screen when a refetch fails; the full error is for no data.
  if (query.isError && !query.data) {
    // 404 is the concealed-scope refusal (another Ministry or unknown Cycle).
    const notAvailable =
      isAxiosError(query.error) && query.error.response?.status === 404;
    // Every dead end keeps the way back; only a failure (not a refusal) can be retried.
    return (
      <div className="space-y-4">
        <MyScheduleBackLink />
        <Alert>
          <AlertDescription>
            {notAvailable
              ? m.my_schedule_ministry_unavailable()
              : m.my_schedule_ministry_load_failed()}
          </AlertDescription>
        </Alert>
        {notAvailable ? null : (
          <Button
            variant="outline"
            size="touch"
            onClick={() => query.refetch()}
          >
            {m.schedules_retry()}
          </Button>
        )}
      </div>
    );
  }

  const schedule = query.data;
  if (!schedule.published) {
    return (
      <div className="space-y-4">
        <MyScheduleBackLink />
        <Alert>
          <AlertDescription>
            {m.my_schedule_ministry_unpublished()}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MyScheduleBackLink />
      {query.isRefetchError ? (
        <Alert>
          <AlertDescription>{m.my_schedule_refresh_failed()}</AlertDescription>
        </Alert>
      ) : null}
      <h1 className="font-semibold text-xl">
        {schedule.ministryName} · {schedule.cycleName}
      </h1>
      {schedule.events.map((event) => (
        <Card key={event.eventId}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h2
                className={cn(
                  'font-semibold text-base',
                  event.cancelled && STRUCK,
                )}
              >
                {event.title}
              </h2>
              {event.cancelled ? <CancelledBadge /> : null}
            </div>
            <p className="text-muted-foreground text-sm tabular-nums">
              {eventWhen({
                start: event.start,
                end: event.end,
                timeZone: churchTimezone,
              })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupByShift(event.rows).map(([blockId, shift]) => (
              <section key={blockId} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className={cn('font-medium', shift.cancelled && STRUCK)}>
                    {shift.label}
                  </h3>
                  {/* A cancelled Event already says it for all its Shifts. */}
                  {shift.cancelled && !event.cancelled ? (
                    <CancelledBadge />
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {shift.rows.map((row, index) => (
                    <li
                      // Rows repeat per place; position within the shift is the only identity.
                      key={index}
                      className="surface-subtle flex justify-between gap-3 px-3 py-2"
                    >
                      <span>
                        {m.my_schedule_ministry_sector_role({
                          sector: row.sectorName,
                          role: row.roleName,
                        })}
                      </span>
                      <span
                        className={
                          row.volunteerDisplayName
                            ? undefined
                            : 'text-muted-foreground'
                        }
                      >
                        {row.volunteerDisplayName ??
                          m.my_schedule_ministry_open_place()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
