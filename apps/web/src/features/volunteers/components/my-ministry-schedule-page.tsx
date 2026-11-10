import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetMinistrySchedule200 } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

export interface MyMinistrySchedulePageProps {
  ministryId: string;
  cycleId: string;
}

type ScheduleRow = GetMinistrySchedule200['events'][number]['rows'][number];

/** The page's read; the breadcrumb hook observes the same key. */
export const myMinistryScheduleKey = (ministryId: string, cycleId: string) =>
  ['my-ministry-schedule', ministryId, cycleId] as const;

function groupByShift(rows: ScheduleRow[]) {
  const shifts = new Map<string, { label: string; rows: ScheduleRow[] }>();
  for (const row of rows) {
    const shift = shifts.get(row.eventTimeBlockId) ?? {
      label: row.eventTimeBlockLabel,
      rows: [],
    };
    shift.rows.push(row);
    shifts.set(row.eventTimeBlockId, shift);
  }
  return [...shifts.entries()];
}

export function MyMinistrySchedulePage({
  ministryId,
  cycleId,
}: MyMinistrySchedulePageProps) {
  const { churchTimezone } = useTimezone();
  const query = useQuery({
    queryKey: myMinistryScheduleKey(ministryId, cycleId),
    queryFn: () => volunteerApi.getMinistrySchedule(ministryId, { cycleId }),
    retry: false,
  });

  if (query.isPending) {
    return (
      <Skeleton
        role="status"
        aria-label={m.my_schedule_ministry_loading()}
        className="h-40 w-full"
      />
    );
  }
  if (query.isError) {
    // 404 is the concealed-scope refusal (another Ministry or unknown Cycle).
    const notAvailable =
      isAxiosError(query.error) && query.error.response?.status === 404;
    return (
      <Alert>
        <AlertDescription>
          {notAvailable
            ? m.my_schedule_ministry_unavailable()
            : m.my_schedule_ministry_load_failed()}
        </AlertDescription>
      </Alert>
    );
  }

  const schedule = query.data;
  if (!schedule.published) {
    return (
      <Alert>
        <AlertDescription>
          {m.my_schedule_ministry_unpublished()}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-xl">
        {schedule.ministryName} · {schedule.cycleName}
      </h1>
      {schedule.events.map((event) => (
        <Card key={event.eventId}>
          <CardHeader>
            <CardTitle>{event.title}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {formatInstantRangeOf({
                start: event.start,
                end: event.end,
                timeZone: churchTimezone,
              })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupByShift(event.rows).map(([blockId, shift]) => (
              <section key={blockId} className="space-y-2">
                <h3 className="font-medium">{shift.label}</h3>
                <ul className="space-y-1">
                  {shift.rows.map((row, index) => (
                    <li
                      // Rows repeat per place; position within the shift is the only identity.
                      // biome-ignore lint/suspicious/noArrayIndexKey: see above
                      key={index}
                      className="flex justify-between gap-3 border px-3 py-2"
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
