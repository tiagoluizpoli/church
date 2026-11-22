import { m } from '@church/i18n/messages';
import { useForm } from '@tanstack/react-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { CircleAlert, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [authError, setAuthError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      setAuthError(undefined);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          // Arriving in the app is the confirmation; no toast.
          onSuccess: () => {
            navigate({
              href: redirectTo ?? '/app',
            });
          },
          onError: (error) => {
            setAuthError(authErrorMessage({ error: error.error }));
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email(m.password_recovery_invalid_email()),
        password: z.string().min(8, m.password_recovery_password_too_short()),
      }),
    },
  });

  if (isPending) {
    return (
      <Pending label={m.auth_session_loading()} className="w-full">
        <Skeleton className="mb-3 h-8 w-56" />
        <Skeleton className="mb-8 h-4 w-full" />
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      </Pending>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-balance font-bold text-2xl tracking-tight md:text-[1.75rem]">
        {m.auth_sign_in_title()}
      </h1>
      <p className="mt-2 mb-8 text-pretty text-muted-foreground text-sm leading-relaxed">
        {m.auth_sign_in_invitation_only()}
      </p>

      {notice === 'password-changed' && (
        <p
          role="status"
          className="surface-subtle mb-6 px-3 py-2.5 text-foreground text-sm"
        >
          {m.password_recovery_password_changed()}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-5"
        noValidate
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  {m.password_recovery_email_label()}
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  className="md:text-sm"
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${field.name}-error`}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldErrors
                  id={`${field.name}-error`}
                  errors={field.state.meta.errors}
                />
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{m.auth_password_label()}</Label>
                <div className="relative">
                  <Input
                    id={field.name}
                    name={field.name}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pr-12 md:text-sm"
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-error`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={m.auth_password_show()}
                    aria-pressed={showPassword}
                    aria-controls={field.name}
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="radius-control absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </div>
                <FieldErrors
                  id={`${field.name}-error`}
                  errors={field.state.meta.errors}
                />
              </div>
            )}
          </form.Field>
        </div>

        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="text-muted-foreground text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current"
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
            <div className="space-y-3 pt-1">
              {authError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-destructive text-sm"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {authError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting && (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {isSubmitting
                  ? m.auth_sign_in_submitting()
                  : m.auth_sign_in_submit()}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>

      {onSwitchToSignUp && (
        <div className="mt-4 text-center">
          <Button variant="link" onClick={onSwitchToSignUp}>
            {m.auth_sign_in_switch_to_sign_up()}
          </Button>
        </div>
      )}
    </div>
  );
}

interface FieldErrorsProps {
  id: string;
  errors: ({ message?: string } | undefined)[];
}

function FieldErrors({ id, errors }: FieldErrorsProps) {
  return (
    <div id={id}>
      {errors.map((error) => (
        <p key={error?.message} className="text-destructive text-sm">
          {error?.message}
        </p>
      ))}
    </div>
  );
}
