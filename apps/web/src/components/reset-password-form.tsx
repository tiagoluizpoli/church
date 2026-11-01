import { m } from '@church/i18n/messages';
import { useForm } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-error-message';
import { clearNotificationCache } from '@/shared/utils/notification-storage';

const MIN_PASSWORD_LENGTH = 8;
const INVALID_TOKEN = 'INVALID_TOKEN';
const PASSWORD_REFUSALS = new Set(['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG']);

/** Missing, malformed, expired and used tokens all end here. */
export function ExpiredResetLink() {
  return (
    <div className="mx-auto mt-10 w-full max-w-md space-y-4 p-6 text-center">
      <p role="alert">{m.password_recovery_link_expired()}</p>
      <Link to="/forgot-password" className={buttonVariants()}>
        {m.password_recovery_request_new_link()}
      </Link>
    </div>
  );
}

export interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [linkExpired, setLinkExpired] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { newPassword: '' },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const { error } = await authClient.resetPassword({
        newPassword: value.newPassword,
        token,
      });
      if (!error) {
        // Every old session was revoked server-side; drop what they cached and
        // make the Better Auth client re-read its session.
        queryClient.clear();
        authClient.$store.notify('$sessionSignal');
        clearNotificationCache();
        await navigate({
          to: '/login',
          search: { notice: 'password-changed' },
        });
        return;
      }
      if (error.code === INVALID_TOKEN) {
        setLinkExpired(true);
      } else if (error.code && PASSWORD_REFUSALS.has(error.code)) {
        setFailure(authErrorMessage({ error }));
      } else {
        setFailure(m.password_recovery_reset_failed());
      }
    },
    validators: {
      onSubmit: z.object({
        newPassword: z
          .string()
          .min(MIN_PASSWORD_LENGTH, m.password_recovery_password_too_short()),
      }),
    },
  });

  if (linkExpired) return <ExpiredResetLink />;

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center font-bold text-3xl">
        {m.password_recovery_reset_title()}
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="newPassword">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                {m.password_recovery_new_password_label()}
              </Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="new-password"
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

        {failure && (
          <p role="alert" className="text-red-500">
            {failure}
          </p>
        )}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? m.password_recovery_reset_submitting()
                : m.password_recovery_reset_submit()}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
