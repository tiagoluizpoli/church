import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { usePlanningCycleBreadcrumb } from '@/features/scheduling/hooks/use-planning-cycle-breadcrumb';
import {
  extractRequestedChurchId,
  resolveCrossChurchDeepLink,
  stripCrossChurchLinkParam,
} from '@/shared/utils/cross-church-link';
import { activeChurchApi } from '@/utils/api-instances';

export const Route = createFileRoute('/_authenticated/_active-church')({
  component: ActiveChurchLayout,
  beforeLoad: async ({ search, location, context }) => {
    // The entry gate's one source of truth: revalidates Church Membership
    // server-side on every load and covers every branch — an already-set
    // Church that no longer checks out, several Memberships with none active,
    // and no Membership at all — rather than only the first of those.
    const { status, churchId, membershipRemovedFrom } =
      await activeChurchApi.getActiveChurchStatus();

    const requestedChurchId = extractRequestedChurchId({ search });
    const currentChurchId = status === 'resolved' ? (churchId ?? null) : null;
    if (requestedChurchId && requestedChurchId !== currentChurchId) {
      // Cached under the query key /select-church and /switch-church-confirm
      // already read from, so a redirect to either shows this list instantly
      // instead of firing a second request for data just fetched here.
      const { churches } = await context.queryClient.ensureQueryData({
        queryKey: ['active-church', 'options'],
        queryFn: () => activeChurchApi.listActiveChurchOptions(),
      });
      const decision = resolveCrossChurchDeepLink({
        requestedChurchId,
        currentChurchId,
        memberChurchIds: churches.map((church) => church.churchId),
      });

      if (decision.kind === 'auto-select') {
        // No existing context is being displaced, so the target Church
        // becomes Active silently and the originally requested destination
        // loads normally below — spec.md §1.5.
        await activeChurchApi.selectActiveChurch({
          churchId: decision.churchId,
        });
        return;
      }

      if (decision.kind === 'needs-confirmation') {
        throw redirect({
          to: '/switch-church-confirm',
          search: {
            target: decision.churchId,
            redirect: stripCrossChurchLinkParam({ href: location.href }),
          },
        });
      }

      if (decision.kind === 'access-denied') {
        // Keep the current Active Church; a generic denial never reveals
        // whether the linked resource exists in the target Church.
        throw redirect({
          to: '/dashboard',
          search: { accessDenied: true },
        });
      }
    }

    if (status === 'selection_required') {
      throw redirect({
        to: '/select-church',
        search: { removedFrom: membershipRemovedFrom },
      });
    }
    if (status === 'no_membership') {
      throw redirect({
        to: '/no-access',
        search: { removedFrom: membershipRemovedFrom },
      });
    }
    if (membershipRemovedFrom) {
      // The one remaining Membership just auto-selected silently — land on
      // the dashboard specifically (not whatever route was in flight) so the
      // explanation has a stable, always-reachable place to show.
      throw redirect({
        to: '/dashboard',
        search: { removedFrom: membershipRemovedFrom },
      });
    }
  },
});

function ActiveChurchLayout() {
  const planningCycleBreadcrumb = usePlanningCycleBreadcrumb();
  const ministryBreadcrumb = useMinistryBreadcrumb();
  const overrides = [planningCycleBreadcrumb, ministryBreadcrumb].filter(
    (override) => override !== null,
  );
  const breadcrumbOverrides = overrides.length > 0 ? overrides : undefined;

  return (
    <AppShell breadcrumbOverrides={breadcrumbOverrides}>
      <Outlet />
    </AppShell>
  );
}
