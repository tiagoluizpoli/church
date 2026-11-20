import { m } from '@church/i18n/messages';
import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

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
    <div className="w-full">
      <h1 className="text-balance font-bold text-2xl tracking-tight md:text-[1.75rem]">
        {m.password_recovery_request_title()}
      </h1>
      <p className="mt-2 mb-8 text-pretty text-muted-foreground text-sm leading-relaxed">
        {m.password_recovery_request_description()}
      </p>

      {requestState === 'sent' ? (
        <p role="status" className="surface-subtle px-3 py-2.5 text-sm">
          {m.password_recovery_request_sent()}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-5"
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
                  <p key={error?.message} className="text-destructive text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          {requestState === 'failed' && (
            <p role="alert" className="text-destructive text-sm">
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

      <div className="mt-6">
        <Link
          to="/login"
          className={cn(buttonVariants({ variant: 'link' }), 'px-0')}
        >
          {m.password_recovery_back_to_login()}
        </Link>
      </div>
    </div>
  );
}
