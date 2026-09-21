import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';
import { isForbiddenError } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import { resolveSchedulingAccessFallback } from '@/shared/hooks/use-scheduling-access-fallback';
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
        const destination = await resolveSchedulingAccessFallback({
          queryClient: context.queryClient,
        });
        redirect({ to: destination, throw: true });
      }
      throw error;
    }
  },
});

function PlanningCyclesRoute() {
  return <PlanningAdmin />;
}
