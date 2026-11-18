import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { ShellErrorFallback } from '@/shared/components/route-fallbacks';
import { OutageError } from '@/shared/utils/outage';

export const Route = createFileRoute('/_authenticated')({
  component: () => <Outlet />,
  errorComponent: ShellErrorFallback,
  beforeLoad: async ({ location }) => {
    // A failed call (rejected, or answered with no status or a 5xx) says nothing
    // about who is signed in, so it must not look like "no session".
    const session = await authClient.getSession().catch((error: unknown) => {
      throw new OutageError({ cause: error });
    });
    if (
      session.error &&
      (!session.error.status || session.error.status >= 500)
    ) {
      throw new OutageError({ cause: session.error });
    }
    if (!session.data) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
    return { session };
  },
});
