import { m } from '@church/i18n/messages';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import {
  MinistrySetupGuide,
  useMinistrySetupGuide,
} from './ministry-setup-guide';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import { classifyMinistryReadError } from '@/features/ministries/ministry-name';
import {
  useMinistry,
  useSectorList,
} from '@/features/ministries/ministry-queries';
import { useMinistryRoles } from '@/features/ministries/role-queries';
import { cn } from '@/lib/utils';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

type MinistryTabPath =
  | '/app/ministries/$ministryId/operational'
  | '/app/ministries/$ministryId/usual-setup'
  | '/app/ministries/$ministryId/settings';

interface MinistryTab {
  to: MinistryTabPath;
  label: () => string;
  adminOnly?: boolean;
}

/** Routed tabs, in the order #385 fixes; Settings is ChurchAdmin-only. */
const MINISTRY_TABS: MinistryTab[] = [
  {
    to: '/app/ministries/$ministryId/operational',
    label: m.ministry_tab_structure,
  },
  {
    to: '/app/ministries/$ministryId/usual-setup',
    label: m.ministry_tab_usual_setup,
  },
  {
    to: '/app/ministries/$ministryId/settings',
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
  const [dismissedOpen, setGuideOpen, dismissGuide] = useMinistrySetupGuide();
  const sectors = useSectorList({ ministryId });
  const roles = useMinistryRoles({ ministryId });
  // A Ministry with a Sector and a Role is already set up: nothing to guide.
  const isConfigured =
    (sectors.data?.sectors.length ?? 0) > 0 &&
    (roles.data?.roles.length ?? 0) > 0;
  // Until both reads settle we cannot tell; a failed read falls back to dismissal alone.
  const isUndecided = sectors.isPending || roles.isPending;
  const guideOpen = dismissedOpen && !isConfigured && !isUndecided;
  const tabList = useRef<HTMLUListElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Keeps the active tab on screen in a narrow, scrolling bar. Instant, never smooth.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on navigation
  useEffect(() => {
    tabList.current
      ?.querySelector('[data-status="active"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname, ministryQuery.isSuccess]);

  function reopenGuide() {
    try {
      localStorage.removeItem('ministry-setup-guide-dismissed');
    } catch {}
    setGuideOpen(true);
  }

  if (ministryQuery.isLoading) {
    return (
      <Pending label={m.ministry_loading()} className="space-y-3">
        <Skeleton className="h-10 w-full max-w-64" />
        <Skeleton className="h-8 w-full max-w-96" />
      </Pending>
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
        <Link
          to="/app/ministries"
          className="text-sm underline underline-offset-2"
        >
          {m.ministry_back_to_list()}
        </Link>
      </div>
    );
  }

  const tabs = MINISTRY_TABS.filter((tab) => isChurchAdmin || !tab.adminOnly);

  return (
    <WorkspacePage className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-semibold text-2xl tracking-[-0.02em] md:text-3xl">
          {ministryQuery.data?.name}
        </h1>
        {!guideOpen && !isConfigured && !isUndecided && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={reopenGuide}
            className="mt-2 shrink-0 text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {m.ministry_setup_guide_open()}
          </Button>
        )}
      </div>
      <MinistrySetupGuide open={guideOpen} onDismiss={dismissGuide} />
      <nav aria-label={m.ministry_tabs_label()}>
        <ul
          ref={tabList}
          className="flex gap-1 overflow-x-auto border-border border-b pb-px"
        >
          {tabs.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                params={{ ministryId }}
                className={cn(
                  '-mb-px inline-block whitespace-nowrap border-transparent border-b-2 px-3 py-2 font-medium text-muted-foreground text-sm hover:text-foreground',
                  // Inset: the scroll container would clip an outer ring.
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
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
