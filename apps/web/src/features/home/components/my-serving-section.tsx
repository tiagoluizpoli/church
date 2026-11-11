import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { AssignmentLink } from '@/features/volunteers/components/assignment-link';
import { CheckDeadline } from '@/features/volunteers/components/check-deadline';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { volunteerApi } from '@/utils/api-instances';

const ASSIGNMENT_LIMIT = 3;

interface FailureProps {
  message: string;
  onRetry: () => void;
}

function Failure({ message, onRetry }: FailureProps) {
  return (
    <div role="alert" className="space-y-3">
      <p>{message}</p>
      <Button variant="outline" size="touch" onClick={onRetry}>
        {m.home_retry()}
      </Button>
    </div>
  );
}

export function MyServingSection({ churchId, userId }: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone });
  const checksQuery = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['availability-checks'],
    }),
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: false,
  });
  const scheduleQuery = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['schedule'],
    }),
    queryFn: () => volunteerApi.getPublishedVolunteerSchedule(),
    retry: false,
  });
  const pending = (checksQuery.data?.checks ?? []).filter(
    (check) => check.state !== 'confirmed',
  );
  // Sort before limiting so the three are the next Assignments, not the first day groups.
  const upcoming = [...(scheduleQuery.data?.assignments ?? [])]
    .sort((left, right) =>
      compareInstants({
        left: parseInstant({ value: left.startTime }),
        right: parseInstant({ value: right.startTime }),
      }),
    )
    .slice(0, ASSIGNMENT_LIMIT);

  return (
    <section
      aria-labelledby="home-section-serving"
      data-church-id={churchId}
      data-user-id={userId}
      className="space-y-4"
    >
      <h2 id="home-section-serving" className="font-semibold text-xl">
        {m.home_section_serving()}
      </h2>
      {checksQuery.isLoading ? (
        <div role="status" aria-label={m.availability_list_loading()}>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : checksQuery.isError ? (
        <Failure
          message={m.availability_list_error()}
          onRetry={() => checksQuery.refetch()}
        />
      ) : pending.length > 0 ? (
        <ul className="space-y-3">
          {pending.map((check) => (
            <li key={check.id}>
              <Link
                to="/availability/$checkId"
                params={{ checkId: check.id }}
                className="radius-surface block transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <Card>
                  <CardContent className="space-y-2 text-sm">
                    <h3 className="break-words font-semibold text-base">
                      {check.ministryName}
                    </h3>
                    <p>{check.cycleName}</p>
                    <CheckDeadline check={check} churchDay={churchDay} />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {scheduleQuery.isLoading ? (
        <div role="status" aria-label={m.my_schedule_loading()}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : scheduleQuery.isError ? (
        <Failure
          message={m.my_schedule_load_error()}
          onRetry={() => scheduleQuery.refetch()}
        />
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p>{m.my_schedule_empty()}</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((assignment) => (
                <li key={assignment.assignmentId}>
                  <AssignmentLink assignment={assignment} timeZone={timeZone} />
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/my-schedule"
            className="inline-block min-h-11 py-2 underline"
          >
            {m.home_serving_see_all()}
          </Link>
        </>
      )}
    </section>
  );
}
