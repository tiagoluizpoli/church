import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';
import { isForbiddenError } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/planning-cycles',
)({
  component: PlanningCyclesRoute,
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ['planning-cycles'],
        queryFn: () => adminApi.listPlanningCycles(),
      });
    } catch (error) {
      if (isForbiddenError({ error })) {
        redirect({ to: '/dashboard', throw: true });
      }
      throw error;
    }
  },
});

function PlanningCyclesRoute() {
  return <PlanningAdmin />;
}
