import { m } from '@church/i18n/messages';
import { now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckDeadline } from './check-deadline';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { volunteerApi } from '@/utils/api-instances';

function AvailabilityListContent() {
  const { churchTimezone } = useTimezone();
  const instant = now();
  const churchDay = today({ instant, timeZone: churchTimezone });
  const checksQuery = useQuery({
    queryKey: ['availability-checks'],
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: false,
  });
  const checks = [...(checksQuery.data?.checks ?? [])].sort(
    (left, right) =>
      Number(left.state === 'confirmed') - Number(right.state === 'confirmed'),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <h1 className="font-semibold text-xl">{m.nav_availability()}</h1>
      {checksQuery.isLoading ? (
        <div role="status" aria-label={m.availability_list_loading()}>
          <Skeleton className="h-32 w-full" />
        </div>
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
                    <h2 className="break-words font-semibold text-base">
                      {check.ministryName}
                    </h2>
                    <p>{check.cycleName}</p>
                    <p>
                      {check.state !== 'confirmed'
                        ? m.availability_list_not_confirmed()
                        : check.unavailableShiftCount === 0
                          ? m.availability_list_confirmed_all()
                          : m.availability_list_confirmed_count({
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

export function AvailabilityListPage() {
  return (
    <CapabilityGate
      allow={(capabilities) => capabilities.hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityListContent />
    </CapabilityGate>
  );
}
