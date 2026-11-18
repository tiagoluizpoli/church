import { m } from '@church/i18n/messages';
import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

type RequestState = 'idle' | 'sent' | 'failed';

export default function ForgotPasswordForm() {
  const [requestState, setRequestState] = useState<RequestState>('idle');

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      setRequestState('idle');
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // The answer is identical for known and unknown addresses; only a
      // failed request differs, and says nothing about registration.
      setRequestState(error ? 'failed' : 'sent');
    },
    validators: {
      onSubmit: z.object({
        email: z.email(m.password_recovery_invalid_email()),
      }),
    },
  });

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-2 text-center font-bold text-3xl">
        {m.password_recovery_request_title()}
      </h1>
      <p className="mb-6 text-center text-muted-foreground text-sm">
        {m.password_recovery_request_description()}
      </p>

      {requestState === 'sent' ? (
        <p role="status" className="text-center">
          {m.password_recovery_request_sent()}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
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

          {requestState === 'failed' && (
            <p role="alert" className="text-red-500">
              {m.password_recovery_request_failed()}
            </p>
          )}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? m.password_recovery_request_submitting()
                  : m.password_recovery_request_submit()}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}

      <div className="mt-4 text-center">
        <Link to="/login" className={buttonVariants({ variant: 'link' })}>
          {m.password_recovery_back_to_login()}
        </Link>
      </div>
    </div>
  );
}
