import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ShellErrorFallback } from '@/shared/components/route-fallbacks';
import { getCachedSession } from '@/shared/utils/entry-gate-cache';

export const Route = createFileRoute('/app')({
  component: () => <Outlet />,
  errorComponent: ShellErrorFallback,
  beforeLoad: async ({ location, context }) => {
    const session = await getCachedSession({
      queryClient: context.queryClient,
    });
    if (!session.data) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
    return { session };
  },
});
