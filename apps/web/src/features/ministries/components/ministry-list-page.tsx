import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { CreateMinistryDialog } from '@/features/ministries/components/create-ministry-dialog';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

/** The caller's active Ministries, as the server orders them; never auto-opens a single row. */
export function MinistryListPage() {
  const { isChurchAdmin } = useCallerCapabilities();
  const ministriesQuery = useMinistryList({ enabled: true });
  const ministries = ministriesQuery.data?.ministries ?? [];

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_ministries()}
        description={m.ministries_description()}
        autoFocusTitle
        aside={isChurchAdmin ? <CreateMinistryDialog /> : null}
      />
      {ministriesQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.ministries_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ministriesQuery.refetch()}
            >
              {m.ministries_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : ministriesQuery.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : ministries.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          {m.ministries_empty()}
        </p>
      ) : (
        <ul
          aria-label={m.nav_ministries()}
          className="surface-panel divide-y divide-border"
        >
          {ministries.map((ministry) => (
            <li key={ministry.id}>
              <Link
                to="/ministries/$ministryId"
                params={{ ministryId: ministry.id }}
                className="block px-4 py-3 font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                {ministry.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePage>
  );
}
