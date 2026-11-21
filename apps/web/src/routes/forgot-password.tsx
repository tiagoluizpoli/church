import { createFileRoute } from '@tanstack/react-router';
import { AuthShell } from '@/components/auth-shell';
import ForgotPasswordForm from '@/components/forgot-password-form';

export const Route = createFileRoute('/forgot-password')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
