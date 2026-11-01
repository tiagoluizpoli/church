import { m } from '@church/i18n/messages';
import { useForm } from '@tanstack/react-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import z from 'zod';
import Loader from './loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-error-message';

export interface SignInFormProps {
  onSwitchToSignUp?: () => void;
  redirectTo?: string;
  /** Set by the password-reset flow when it returns here. */
  notice?: 'password-changed';
}

export default function SignInForm({
  onSwitchToSignUp,
  redirectTo,
  notice,
}: SignInFormProps) {
  const navigate = useNavigate({
    from: '/',
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              href: redirectTo ?? '/',
            });
            toast.success('Sign in successful');
          },
          onError: (error) => {
            toast.error(authErrorMessage({ error: error.error }));
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-2 text-center font-bold text-3xl">Welcome Back</h1>
      <p className="mb-6 text-center text-muted-foreground text-sm">
        Access is invitation-only. Sign in with the account from your
        invitation.
      </p>

      {notice === 'password-changed' && (
        <p role="status" className="mb-4 text-center text-sm">
          {m.password_recovery_password_changed()}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-muted-foreground text-sm underline"
          >
            {m.password_recovery_forgot_link()}
          </Link>
        </div>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Sign In'}
            </Button>
          )}
        </form.Subscribe>
      </form>

      {onSwitchToSignUp && (
        <div className="mt-4 text-center">
          <Button
            variant="link"
            onClick={onSwitchToSignUp}
            className="text-indigo-600 hover:text-indigo-800"
          >
            Need an account? Sign Up
          </Button>
        </div>
      )}
    </div>
  );
}
