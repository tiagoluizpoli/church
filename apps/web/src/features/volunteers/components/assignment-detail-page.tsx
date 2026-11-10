import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetAssignmentDetail200 } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

export interface AssignmentDetailPageProps {
  assignmentId: string;
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

interface AssignmentFactsProps {
  detail: GetAssignmentDetail200;
}

function AssignmentFacts({ detail }: AssignmentFactsProps) {
  const { churchTimezone } = useTimezone();
  const {
    eventTitle,
    startTime,
    endTime,
    ministryName,
    sectorName,
    roleName,
    leaderName,
    ministryId,
    cycleId,
    roster,
  } = detail;
  const day = assignmentDayLabel({ startTime, timeZone: churchTimezone });
  const when = formatInstantRangeOf({
    start: startTime,
    end: endTime,
    timeZone: churchTimezone,
  });
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-xl">
        {day} · {ministryName}
      </h1>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label={m.assignment_field_event()} value={eventTitle} />
        <Fact label={m.assignment_field_when()} value={when} />
        <Fact label={m.assignment_field_ministry()} value={ministryName} />
        <Fact label={m.assignment_field_sector()} value={sectorName} />
        <Fact label={m.assignment_field_role()} value={roleName} />
        {leaderName ? (
          <Fact label={m.assignment_field_leader()} value={leaderName} />
        ) : null}
      </dl>
      <section aria-labelledby="assignment-roster" className="space-y-3">
        <h2 id="assignment-roster" className="font-semibold">
          {m.assignment_roster_heading()}
        </h2>
        {roster.map((group) => (
          <div
            key={`${group.sectorName}:${group.roleName}`}
            className="rounded-md border p-3"
          >
            <p className="font-medium text-sm">
              {group.sectorName} · {group.roleName}
            </p>
            <ul className="mt-2 space-y-1">
              {group.people.map((person, index) => (
                <li
                  // Names can repeat within a group; order is stable per read.
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  key={index}
                  className={person.isYou ? 'font-semibold' : undefined}
                  aria-current={person.isYou ? 'true' : undefined}
                >
                  {person.name}
                  {person.isYou ? (
                    <Badge className="ml-2">{m.assignment_roster_you()}</Badge>
                  ) : null}
                </li>
              ))}
              {Array.from({ length: group.openCount }, (_, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
                  key={`open-${index}`}
                  className="text-muted-foreground italic"
                >
                  {m.assignment_roster_open()}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        {/* shortcut: plain anchor until #796 adds the typed /my-schedule/$ministryId/$cycleId route; swap for <Link> then. */}
        <a
          href={`/my-schedule/${ministryId}/${cycleId}`}
          className={buttonVariants({ size: 'touch' })}
        >
          {m.assignment_full_schedule()}
        </a>
        <Button
          variant="outline"
          size="touch"
          disabled
          aria-describedby="assignment-need-help-soon"
        >
          {m.assignment_need_help()}
        </Button>
        <span
          id="assignment-need-help-soon"
          className="text-muted-foreground text-sm"
        >
          {m.assignment_need_help_soon()}
        </span>
      </div>
    </div>
  );
}

export function AssignmentDetailPage({
  assignmentId,
}: AssignmentDetailPageProps) {
  const query = useQuery({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: () => volunteerApi.getAssignmentDetail(assignmentId),
    retry: false,
  });
  if (query.isLoading)
    return (
      <div role="status" aria-label={m.assignment_detail_loading()}>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError) {
    const status = isAxiosError(query.error)
      ? query.error.response?.status
      : undefined;
    // 404 is also another Volunteer's id (ADR-0009), so one neutral message.
    if (status === 404)
      return (
        <div role="status" className="space-y-3">
          <p>{m.assignment_stale()}</p>
          <Link
            to="/my-schedule"
            className={buttonVariants({ variant: 'outline', size: 'touch' })}
          >
            {m.assignment_stale_back()}
          </Link>
        </div>
      );
    return (
      <div role="alert" className="space-y-3 text-destructive">
        <p>{m.assignment_detail_load_error()}</p>
        <Button variant="outline" size="touch" onClick={() => query.refetch()}>
          {m.schedules_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data) return null;
  return <AssignmentFacts detail={query.data} />;
}
