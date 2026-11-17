import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { ShellErrorFallback } from '@/shared/components/route-fallbacks';

export const Route = createFileRoute('/_authenticated')({
  component: () => <Outlet />,
  errorComponent: ShellErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
    return { session };
  },
});
