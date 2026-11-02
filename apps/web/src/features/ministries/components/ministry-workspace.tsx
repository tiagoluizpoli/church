import { m } from '@church/i18n/messages';
import { Link, Outlet } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import { classifyMinistryReadError } from '@/features/ministries/ministry-name';
import { useMinistry } from '@/features/ministries/ministry-queries';
import { cn } from '@/lib/utils';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

type MinistryTabPath =
  | '/ministries/$ministryId/sectors'
  | '/ministries/$ministryId/roles'
  | '/ministries/$ministryId/usual-setup'
  | '/ministries/$ministryId/settings';

interface MinistryTab {
  to: MinistryTabPath;
  label: () => string;
  adminOnly?: boolean;
}

/** Routed tabs, in the order #385 fixes; Settings is ChurchAdmin-only. */
const MINISTRY_TABS: MinistryTab[] = [
  { to: '/ministries/$ministryId/sectors', label: m.ministry_tab_sectors },
  { to: '/ministries/$ministryId/roles', label: m.ministry_tab_roles },
  {
    to: '/ministries/$ministryId/usual-setup',
    label: m.ministry_tab_usual_setup,
  },
  {
    to: '/ministries/$ministryId/settings',
    label: m.ministry_tab_settings,
    adminOnly: true,
  },
];

interface MinistryWorkspaceProps {
  ministryId: string;
}

/** Resolves the Ministry once for every tab; refusals replace the whole workspace. */
export function MinistryWorkspace({ ministryId }: MinistryWorkspaceProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const ministryQuery = useMinistry({ ministryId });

  if (ministryQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-96" />
      </div>
    );
  }

  if (ministryQuery.isError) {
    const kind = classifyMinistryReadError({ error: ministryQuery.error });
    if (kind === 'failed') {
      return (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.ministries_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ministryQuery.refetch()}
            >
              {m.ministries_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="space-y-3" role="status">
        <p className="text-muted-foreground">
          {kind === 'forbidden' ? m.shell_no_access() : m.ministry_not_found()}
        </p>
        <Link to="/ministries" className="text-sm underline underline-offset-2">
          {m.ministry_back_to_list()}
        </Link>
      </div>
    );
  }

  const tabs = MINISTRY_TABS.filter((tab) => isChurchAdmin || !tab.adminOnly);

  return (
    <WorkspacePage className="space-y-6">
      <h1 className="font-semibold text-3xl tracking-[-0.02em]">
        {ministryQuery.data?.name}
      </h1>
      <nav aria-label={m.ministry_tabs_label()}>
        <ul className="flex flex-wrap gap-1 border-border border-b">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                params={{ ministryId }}
                className={cn(
                  '-mb-px inline-block border-transparent border-b-2 px-3 py-2 font-medium text-muted-foreground text-sm hover:text-foreground',
                  'data-[status=active]:border-primary data-[status=active]:text-foreground',
                )}
              >
                {tab.label()}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </WorkspacePage>
  );
}
