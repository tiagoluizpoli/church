import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { usePlanningCycleBreadcrumb } from '@/features/scheduling/hooks/use-planning-cycle-breadcrumb';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_authenticated/_active-church')({
  component: ActiveChurchLayout,
  beforeLoad: async ({ context }) => {
    const activeOrganizationId =
      context.session.data?.session?.activeOrganizationId;
    // No active Church yet is not itself a denial: the Church-scoped request
    // this shell is about to make auto-selects a sole Membership server-side.
    // An *already-set* Church that no longer checks out is what must gate
    // the shell — a stale session naming a Church the User was removed from.
    if (activeOrganizationId) {
      const activeMember = await authClient.organization.getActiveMember();
      if (!activeMember.data) {
        throw redirect({ to: '/no-access' });
      }
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
