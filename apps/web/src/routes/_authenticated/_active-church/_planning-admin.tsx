import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';
import { isForbiddenError } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin',
)({
  component: CyclesRoute,
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ['cycles'],
        queryFn: () => adminApi.listCycles(),
      });
    } catch (error) {
      if (isForbiddenError({ error })) {
        redirect({ to: '/', throw: true });
      }
      throw error;
    }
  },
});

function CyclesRoute() {
  return <PlanningAdmin />;
}
