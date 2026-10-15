import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { useSchedulingAccessFallback } from '@/shared/hooks/use-scheduling-access-fallback';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/teams/$ministryId',
)({
  component: TeamScheduleCyclesRoute,
  validateSearch: z.object({ teamId: z.string() }),
});

function TeamScheduleCyclesRoute() {
  const { ministryId } = Route.useParams();
  const { teamId } = Route.useSearch();
  const cyclesQuery = useQuery({
    queryKey: ['team-schedule-cycles', ministryId, teamId],
    queryFn: () => adminApi.listTeamScheduleCycles(teamId, { ministryId }),
    retry: false,
  });

  useSchedulingAccessFallback({ shouldRedirect: cyclesQuery.isError });

  if (cyclesQuery.isError) return null;

  const cycles = cyclesQuery.data?.cycles ?? [];

  return (
    <WorkspacePage data-testid="team-schedule-cycles">
      <WorkspaceIntroPanel
        title="Team schedule"
        description="Choose a sent cycle to review your Team's schedule."
        autoFocusTitle
      />

      {cyclesQuery.isLoading ? (
        <div
          className="flex flex-col gap-4"
          role="status"
          aria-label="Loading Team schedule"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : cycles.length === 0 ? (
        <Alert>
          <AlertTitle>No sent cycles</AlertTitle>
          <AlertDescription>
            This Team has no current or future schedule work to review.
          </AlertDescription>
        </Alert>
      ) : (
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Team schedule cycles"
        >
          {cycles.map((cycle) => (
            <Card key={cycle.cycleId}>
              <CardHeader>
                <CardTitle>{cycle.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Read-only Team schedule
                </p>
              </CardContent>
              <CardFooter>
                <Link
                  to="/schedules/$ministryId/$cycleId/assign"
                  params={{ ministryId, cycleId: cycle.cycleId }}
                  search={{ teamId }}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Open schedule
                </Link>
              </CardFooter>
            </Card>
          ))}
        </section>
      )}
    </WorkspacePage>
  );
}
