import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { CreateMinistryDialog } from '@/features/ministries/components/create-ministry-dialog';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

interface MinistryActionProps {
  ministry: { id: string; name: string };
}

function MinistryAction({ ministry }: MinistryActionProps) {
  return (
    <div className="flex w-full justify-end">
      <Link
        to="/ministries/$ministryId"
        params={{ ministryId: ministry.id }}
        aria-label={m.ministries_open_label({ name: ministry.name })}
        className={buttonVariants({
          variant: 'outline',
          size: 'xs',
          className: 'min-h-11 min-w-11 md:min-h-0 md:min-w-0',
        })}
      >
        {m.ministries_open()}
      </Link>
    </div>
  );
}

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
        <DataTable
          aria-label={m.nav_ministries()}
          columns={[
            { id: 'name', name: m.ministries_name_label(), isRowHeader: true },
            { id: 'actions', name: m.people_column_actions() },
          ]}
          items={ministries}
          rowId={({ item }) => item.id}
          renderCell={({ item, column }) =>
            column.id === 'name' ? (
              item.name
            ) : (
              <MinistryAction ministry={item} />
            )
          }
          renderMobileCard={({ item }) => (
            <div className="surface-subtle workspace-panel space-y-2">
              <p className="break-words font-medium">{item.name}</p>
              <MinistryAction ministry={item} />
            </div>
          )}
        />
      )}
    </WorkspacePage>
  );
}
