import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';
import { isForbiddenError } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import { ENTRY_GATE_STALE_TIME_MS } from '@/shared/utils/entry-gate-cache';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute('/app/_active-church/_planning-admin')({
  component: CyclesRoute,
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ['cycles'],
        queryFn: () => adminApi.listCycles(),
        staleTime: ENTRY_GATE_STALE_TIME_MS,
      });
    } catch (error) {
      if (isForbiddenError({ error })) {
        redirect({ to: '/app', throw: true });
      }
      throw error;
    }
  },
});

function CyclesRoute() {
  return <PlanningAdmin />;
}
