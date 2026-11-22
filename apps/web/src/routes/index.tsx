import { createFileRoute, redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { isFailedSessionStatus } from '@/shared/utils/outage';

/** Placeholder until the landing page exists: renders nothing, only redirects. */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await authClient.getSession().catch(() => undefined);
    // Only a definite "no session" goes to sign-in; /app's guard owns the outage state.
    const signedOut =
      session !== undefined &&
      !session.data &&
      !(session.error && isFailedSessionStatus(session.error.status));
    throw redirect({ to: signedOut ? '/login' : '/app' });
  },
});
