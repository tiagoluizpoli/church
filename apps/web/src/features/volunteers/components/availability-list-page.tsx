import { m } from '@church/i18n/messages';
import { now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { CheckDeadline } from './check-deadline';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { volunteerApi } from '@/utils/api-instances';

export interface AvailabilityListPageProps {
  /** The check the volunteer just answered, acknowledged until they leave the list. */
  answeredCheckId?: string;
}

function AvailabilityListContent({
  answeredCheckId,
}: AvailabilityListPageProps) {
  const { churchTimezone } = useTimezone();
  const instant = now();
  const churchDay = today({ instant, timeZone: churchTimezone });
  const checksQuery = useQuery({
    queryKey: ['availability-checks'],
    queryFn: () => volunteerApi.listAvailabilityChecks(),
  });
  const checks = [...(checksQuery.data?.checks ?? [])].sort(
    (left, right) =>
      Number(left.state === 'confirmed') - Number(right.state === 'confirmed'),
  );

  const answered = checks.find((check) => check.id === answeredCheckId);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <h1 className="font-semibold text-xl">{m.nav_availability()}</h1>
      {answered ? (
        <p
          role="status"
          className="radius-control flex items-center gap-2 bg-green-600/10 p-3 font-medium text-green-700 text-sm dark:text-green-400"
        >
          <CircleCheck aria-hidden className="size-5 shrink-0" />
          {m.availability_list_answered({ ministry: answered.ministryName })}
        </p>
      ) : null}
      {checksQuery.isLoading ? (
        <Pending label={m.availability_list_loading()}>
          <Skeleton className="h-32 w-full" />
        </Pending>
      ) : checksQuery.isError ? (
        <div role="alert" className="space-y-3">
          <p>{m.availability_list_error()}</p>
          <Button
            variant="outline"
            size="touch"
            onClick={() => checksQuery.refetch()}
          >
            {m.schedules_retry()}
          </Button>
        </div>
      ) : checks.length === 0 ? (
        <p className="text-muted-foreground">{m.availability_list_empty()}</p>
      ) : (
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.id}>
              <Link
                to="/availability/$checkId"
                params={{ checkId: check.id }}
                className="radius-surface block transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <Card>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h2 className="break-words font-semibold text-base">
                        {check.ministryName}
                      </h2>
                      {check.id === answered?.id ? (
                        <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                          <CircleCheck aria-hidden className="size-4" />
                          {m.availability_list_sent_now()}
                        </span>
                      ) : null}
                    </div>
                    <p>{check.cycleName}</p>
                    <p>
                      {check.state !== 'confirmed'
                        ? m.availability_list_not_confirmed()
                        : check.unavailableShiftCount === 0
                          ? m.availability_list_confirmed_all()
                          : (check.totalShiftCount === 1
                              ? m.availability_list_confirmed_count_one
                              : m.availability_list_confirmed_count)({
                              unavailable: check.unavailableShiftCount,
                              total: check.totalShiftCount,
                            })}
                    </p>
                    <CheckDeadline check={check} churchDay={churchDay} />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AvailabilityListPage(props: AvailabilityListPageProps) {
  return (
    <CapabilityGate
      allow={(capabilities) => capabilities.hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityListContent {...props} />
    </CapabilityGate>
  );
}
