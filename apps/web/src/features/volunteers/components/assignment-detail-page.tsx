import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import { SwapRequestSheet } from './swap-request-sheet';
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

const swapStatusLine = {
  open: () => m.swap_requested_waiting(),
  withdrawn: () => '',
  covered: () => m.swap_covered(),
  kept: () => m.swap_kept(),
  expired: () => m.swap_expired(),
};

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
    swapRequest,
  } = detail;
  const [swapOpen, setSwapOpen] = useState(false);
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
      {swapRequest && swapRequest.status !== 'withdrawn' ? (
        <section
          aria-labelledby="swap-requested"
          className="space-y-1 rounded-md border p-3"
        >
          <p id="swap-requested" className="font-medium">
            {swapStatusLine[swapRequest.status]()}
          </p>
          {swapRequest.status === 'open' && swapRequest.note ? (
            <p className="text-muted-foreground text-sm">
              {m.swap_requested_note({ note: swapRequest.note })}
            </p>
          ) : null}
          {swapRequest.status === 'kept' && swapRequest.reply ? (
            <p className="text-muted-foreground text-sm">
              {m.swap_kept_reply({ reply: swapRequest.reply })}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/my-schedule/$ministryId/$cycleId"
          params={{ ministryId, cycleId }}
          className={buttonVariants({ size: 'touch' })}
        >
          {m.assignment_full_schedule()}
        </Link>
        {swapRequest?.status === 'open' ||
        compareInstants({
          left: parseInstant({ value: startTime }),
          right: now(),
        }) <= 0 ? null : (
          <Button
            variant="outline"
            size="touch"
            onClick={() => setSwapOpen(true)}
          >
            {m.swap_ask()}
          </Button>
        )}
      </div>
      <SwapRequestSheet
        assignmentId={detail.assignmentId}
        open={swapOpen}
        onOpenChange={setSwapOpen}
      />
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
