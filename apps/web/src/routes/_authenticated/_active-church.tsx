import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { usePlanningCycleBreadcrumb } from '@/features/scheduling/hooks/use-planning-cycle-breadcrumb';
import { activeChurchApi } from '@/utils/api-instances';

export const Route = createFileRoute('/_authenticated/_active-church')({
  component: ActiveChurchLayout,
  beforeLoad: async () => {
    // The entry gate's one source of truth: revalidates Church Membership
    // server-side on every load and covers every branch — an already-set
    // Church that no longer checks out, several Memberships with none active,
    // and no Membership at all — rather than only the first of those.
    const { status } = await activeChurchApi.getActiveChurchStatus();
    if (status === 'selection_required') {
      throw redirect({ to: '/select-church' });
    }
    if (status === 'no_membership') {
      throw redirect({ to: '/no-access' });
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
