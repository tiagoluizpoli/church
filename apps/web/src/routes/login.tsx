import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import SignInForm from '@/components/sign-in-form';
import { authClient } from '@/lib/auth-client';
import { validateInternalReturnTarget } from '@/shared/utils/return-target';

const HOME_PATH = '/app';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  notice: z.literal('password-changed').optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: RouteComponent,
  // A loader, not beforeLoad: the router fetches the form's chunk while this waits.
  // Never kept, so a revisit checks the session before showing the form again.
  gcTime: 0,
  loaderDeps: ({ search }) => ({ redirect: search.redirect }),
  loader: async ({ deps }) => {
    const session = await authClient.getSession();
    if (session.data) {
      const target =
        validateInternalReturnTarget({ target: deps.redirect }) ?? HOME_PATH;
      throw redirect({ href: target });
    }
  },
});

function RouteComponent() {
  const { redirect: redirectSearch, notice } = Route.useSearch();
  const redirectTo =
    validateInternalReturnTarget({ target: redirectSearch }) ?? undefined;

  return (
    <AuthShell>
      <SignInForm redirectTo={redirectTo} notice={notice} />
    </AuthShell>
  );
}
