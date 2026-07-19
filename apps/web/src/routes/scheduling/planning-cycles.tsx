import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';
import { isForbiddenError } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import { authClient } from '@/lib/auth-client';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute('/scheduling/planning-cycles')({
  component: PlanningCyclesRoute,
  beforeLoad: async ({ context }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }

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

    return { session };
  },
});

function PlanningCyclesRoute() {
  return <PlanningAdmin />;
}
