import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import SignInForm from '@/components/sign-in-form';
import { authClient } from '@/lib/auth-client';
import { validateInternalReturnTarget } from '@/shared/utils/return-target';

const DASHBOARD_PATH = '/dashboard';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: RouteComponent,
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession();
    if (session.data) {
      const target =
        validateInternalReturnTarget({ target: search.redirect }) ??
        DASHBOARD_PATH;
      throw redirect({ href: target });
    }
  },
});

function RouteComponent() {
  const { redirect: redirectSearch } = Route.useSearch();
  const redirectTo =
    validateInternalReturnTarget({ target: redirectSearch }) ?? undefined;

  return <SignInForm redirectTo={redirectTo} />;
}
