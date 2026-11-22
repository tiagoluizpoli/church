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
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession();
    if (session.data) {
      const target =
        validateInternalReturnTarget({ target: search.redirect }) ?? HOME_PATH;
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
