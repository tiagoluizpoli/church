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
  '/_authenticated/_active-church/scheduling/rostering/$ministryId/',
)({
  component: TeamRosterCyclesRoute,
  validateSearch: z.object({ teamId: z.string() }),
});

function TeamRosterCyclesRoute() {
  const { ministryId } = Route.useParams();
  const { teamId } = Route.useSearch();
  const cyclesQuery = useQuery({
    queryKey: ['team-roster-cycles', ministryId, teamId],
    queryFn: () => adminApi.listTeamRosterCycles(teamId, { ministryId }),
    retry: false,
  });

  useSchedulingAccessFallback({ shouldRedirect: cyclesQuery.isError });

  if (cyclesQuery.isError) return null;

  const cycles = cyclesQuery.data?.cycles ?? [];

  return (
    <WorkspacePage data-testid="team-roster-cycles">
      <WorkspaceIntroPanel
        title="Team roster"
        description="Choose a locked cycle to review your Team's roster."
        autoFocusTitle
      />

      {cyclesQuery.isLoading ? (
        <div
          className="flex flex-col gap-4"
          role="status"
          aria-label="Loading Team rosters"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : cycles.length === 0 ? (
        <Alert>
          <AlertTitle>No locked roster cycles</AlertTitle>
          <AlertDescription>
            This Team has no current or future roster work to review.
          </AlertDescription>
        </Alert>
      ) : (
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Team roster cycles"
        >
          {cycles.map((cycle) => (
            <Card key={cycle.cycleId}>
              <CardHeader>
                <CardTitle>{cycle.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Read-only Team roster
                </p>
              </CardContent>
              <CardFooter>
                <Link
                  to="/scheduling/rostering/$ministryId/$cycleId"
                  params={{ ministryId, cycleId: cycle.cycleId }}
                  search={{ teamId }}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Open roster
                </Link>
              </CardFooter>
            </Card>
          ))}
        </section>
      )}
    </WorkspacePage>
  );
}
