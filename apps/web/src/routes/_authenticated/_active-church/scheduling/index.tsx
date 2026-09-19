import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import type { GetSchedulingCapability200EntriesItem } from '@/infrastructure/api/churchAPI.schemas';
import { schedulingCapabilitiesApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/',
)({
  component: SchedulingIndexRoute,
});

function SchedulingIndexRoute() {
  const capabilityQuery = useQuery({
    queryKey: ['scheduling-capability'],
    queryFn: () => schedulingCapabilitiesApi.getSchedulingCapability(),
    retry: false,
  });
  const entries = capabilityQuery.data?.entries ?? [];
  const retryCapability = () => capabilityQuery.refetch();

  return (
    <WorkspacePage data-testid="scheduling-capability-index">
      <WorkspaceIntroPanel
        title="Scheduling"
        description="Choose the scheduling work you can manage in this church."
        autoFocusTitle
      />

      {capabilityQuery.isLoading ? (
        <div
          className="flex flex-col gap-4"
          role="status"
          aria-label="Loading Scheduling"
        >
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : capabilityQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load Scheduling</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Check your connection and try again.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={retryCapability}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : entries.length > 0 ? (
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Scheduling workspaces"
        >
          {entries.map((entry) => (
            <SchedulingEntryCard
              key={entry.kind === 'church' ? entry.kind : entry.ministryId}
              entry={entry}
            />
          ))}
        </section>
      ) : (
        <Alert>
          <AlertTitle>No Scheduling work is available</AlertTitle>
          <AlertDescription>
            You do not currently lead any Scheduling work in this church.
          </AlertDescription>
        </Alert>
      )}
    </WorkspacePage>
  );
}

function SchedulingEntryCard({
  entry,
}: {
  entry: GetSchedulingCapability200EntriesItem;
}) {
  if (entry.kind === 'church') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Church planning</CardTitle>
          <CardDescription>
            Plan cycles and manage scheduling across the church.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Manage church-wide planning work.</p>
        </CardContent>
        <CardFooter>
          <Link
            to="/scheduling/planning-cycles"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open church planning
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{entry.name}</CardTitle>
        <CardDescription>
          Manage Scheduling work for this ministry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Open the ministry workspace to manage its roster.</p>
      </CardContent>
      <CardFooter>
        <Link
          to="/scheduling/tailoring/$ministryId"
          params={{ ministryId: entry.ministryId }}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open {entry.name}
        </Link>
      </CardFooter>
    </Card>
  );
}
