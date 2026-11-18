import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import {
  assignmentDayLabel,
  relativeDayName,
} from '../lib/assignment-day-label';
import { MyScheduleBackLink } from './my-schedule-back-link';
import { SwapRequestSheet } from './swap-request-sheet';
import { SwapWithdrawButton } from './swap-withdraw-button';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetAssignmentDetail200 } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatTimeOf } from '@/shared/utils/church-time';
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
      <dd className="font-medium text-base">{value}</dd>
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

/** Open needs attention (amber), covered is settled (green); the rest are neutral. */
const swapTone = {
  open: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
  withdrawn: '',
  covered:
    'border-green-600/30 bg-green-600/8 text-green-800 dark:text-green-200',
  kept: 'surface-subtle',
  expired: 'surface-subtle',
};

interface AssignmentFactsProps {
  detail: GetAssignmentDetail200;
}

function AssignmentFacts({ detail }: AssignmentFactsProps) {
  const { churchTimezone: timeZone } = useTimezone();
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
  // The same day and time format as the My schedule list.
  const started =
    compareInstants({
      left: parseInstant({ value: startTime }),
      right: now(),
    }) <= 0;
  // A Swap request is for upcoming Assignments without one already open.
  const canSwap = swapRequest?.status !== 'open' && !started;
  const when = `${relativeDayName({ startTime, timeZone }) ?? assignmentDayLabel({ startTime, timeZone })} · ${formatTimeOf({ value: startTime, timeZone })}–${formatTimeOf({ value: endTime, timeZone })}`;
  return (
    <div className={cn('space-y-6 md:max-w-3xl', canSwap && 'pb-20 md:pb-0')}>
      <MyScheduleBackLink />
      <header className="space-y-1">
        <h1 className="text-balance font-semibold text-2xl">{eventTitle}</h1>
        <p className="font-semibold text-lg tabular-nums">{when}</p>
      </header>
      {swapRequest && swapRequest.status !== 'withdrawn' ? (
        <section
          aria-labelledby="swap-requested"
          className={cn(
            'radius-surface flex gap-3 border p-3',
            swapTone[swapRequest.status],
          )}
        >
          {swapRequest.status === 'covered' ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
          ) : (
            <ArrowLeftRight
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p id="swap-requested" className="font-semibold">
              {swapStatusLine[swapRequest.status]()}
            </p>
            {swapRequest.status === 'open' ? (
              <p className="text-sm">{m.swap_still_scheduled()}</p>
            ) : null}
            {swapRequest.status === 'open' && swapRequest.note ? (
              <p className="text-sm opacity-90">
                {m.swap_requested_note({ note: swapRequest.note })}
              </p>
            ) : null}
            {swapRequest.status === 'kept' && swapRequest.reply ? (
              <p className="text-muted-foreground text-sm">
                {m.swap_kept_reply({ reply: swapRequest.reply })}
              </p>
            ) : null}
            {swapRequest.status === 'open' ? (
              <div className="pt-2">
                <SwapWithdrawButton assignmentId={detail.assignmentId} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label={m.assignment_field_role()} value={roleName} />
        <Fact label={m.assignment_field_sector()} value={sectorName} />
        {/* The same rule as the list's role line: never name it twice. */}
        {ministryName === sectorName ? null : (
          <Fact label={m.assignment_field_ministry()} value={ministryName} />
        )}
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
            className="surface-subtle p-3"
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
        {canSwap ? null : (
          // With no Swap request to offer there is no action bar, so the link sits inline.
          <Link
            to="/my-schedule/$ministryId/$cycleId"
            params={{ ministryId, cycleId }}
            className="radius-control -ml-2 inline-flex min-h-11 items-center px-2 font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {m.assignment_full_schedule()}
          </Link>
        )}
      </section>
      {canSwap ? (
        // Fixed, not sticky: the shell's main grows with its content, so sticky never engages there.
        <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 border-t bg-background px-(--workspace-pad-x) pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] *:flex-1 md:static md:border-0 md:bg-transparent md:p-0 md:*:flex-none">
          <Link
            to="/my-schedule/$ministryId/$cycleId"
            params={{ ministryId, cycleId }}
            className={buttonVariants({ variant: 'outline', size: 'touch' })}
          >
            {m.assignment_full_schedule()}
          </Link>
          <Button size="touch" onClick={() => setSwapOpen(true)}>
            {m.swap_ask()}
          </Button>
        </div>
      ) : null}
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
  });
  if (query.isLoading)
    return (
      <Pending
        label={m.assignment_detail_loading()}
        className="space-y-3 md:max-w-3xl"
      >
        <Skeleton className="radius-control h-8 w-2/3" />
        <Skeleton className="radius-control h-6 w-1/2" />
        <Skeleton className="radius-surface h-16 w-full" />
        <Skeleton className="radius-surface h-32 w-full" />
      </Pending>
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
