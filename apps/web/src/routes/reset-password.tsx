import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import ResetPasswordForm, {
  ExpiredResetLink,
} from '@/components/reset-password-form';

// `error` is Better Auth's callback redirect (`?error=INVALID_TOKEN`).
const resetSearchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => resetSearchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { token, error } = Route.useSearch();
  if (!token || error) return <ExpiredResetLink />;
  return <ResetPasswordForm token={token} />;
}
