import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { CalendarClock, CircleAlert, MailCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VolunteerTransferFlow } from '@/features/volunteer-transfer';
import type {
  PreviewChurchInvitation200MinistryAccessLevel,
  RedeemChurchInvitation200,
} from '@/infrastructure/api/churchAPI.schemas';
import { authClient } from '@/lib/auth-client';
import { finishRedemptionAtDashboard } from '@/shared/utils/active-church-switch';
import { redemptionApi } from '@/utils/api-instances';

export const Route = createFileRoute('/invitations/church/$invitationId')({
  component: ChurchInvitationRedemptionRoute,
});

const CODE_RESEND_COOLDOWN_MS = 60_000;

const redeemFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

type RedeemFormValues = z.infer<typeof redeemFormSchema>;

const ACCESS_LEVEL_LABELS: Record<
  PreviewChurchInvitation200MinistryAccessLevel,
  string
> = {
  volunteer: 'Volunteer',
  leader: 'Leader',
};

interface RemainingCooldownSecondsInput {
  codeSentAt: number | null;
  now: number;
}

function remainingCooldownSeconds({
  codeSentAt,
  now,
}: RemainingCooldownSecondsInput): number {
  if (!codeSentAt) return 0;
  const remainingMs = CODE_RESEND_COOLDOWN_MS - (now - codeSentAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

interface RedemptionFailureDescription {
  title: string;
  description: string;
  canRetry: boolean;
  clearCode: boolean;
}

interface DescribeRedemptionOutcomeInput {
  outcome: Exclude<
    RedeemChurchInvitation200,
    { kind: 'full-success' } | { kind: 'church-only' }
  >;
}

function describeRedemptionOutcome({
  outcome,
}: DescribeRedemptionOutcomeInput): RedemptionFailureDescription {
  if (outcome.kind === 'retryable-failure') {
    return {
      title: 'Something went wrong',
      description:
        "Your account was created, but we couldn't finish adding you to the Ministry yet. Try again.",
      canRetry: true,
      clearCode: false,
    };
  }
  if (outcome.reason === 'VERIFICATION_FAILED') {
    return {
      title: "That code didn't work",
      description: 'Request a new code and enter it again to continue.',
      canRetry: true,
      clearCode: true,
    };
  }
  if (outcome.reason === 'IDENTITY_FAILED') {
    return {
      title: "We couldn't create your account",
      description: 'Try again with a different password.',
      canRetry: true,
      clearCode: false,
    };
  }
  return {
    title: 'This invitation is no longer available',
    description:
      'It may have expired or already been used. Ask your Ministry leader for a new invitation.',
    canRetry: false,
    clearCode: false,
  };
}

function ChurchInvitationRedemptionRoute() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!codeSentAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [codeSentAt]);

  const previewQuery = useQuery({
    queryKey: ['redemption', 'church-invitation', invitationId],
    queryFn: () => redemptionApi.previewChurchInvitation(invitationId),
    retry: false,
  });

  const requestCodeMutation = useMutation({
    mutationFn: () =>
      redemptionApi.requestChurchInvitationVerificationCode(invitationId),
    onSuccess: () => setCodeSentAt(Date.now()),
  });

  const redeemMutation = useMutation({
    mutationFn: (values: RedeemFormValues) =>
      redemptionApi.redeemChurchInvitation(invitationId, {
        ...values,
        idempotencyKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.kind === 'full-success') {
        await finishAtDashboard();
        return;
      }
      // The cross-Church split renders its own flow, not a form error.
      if (outcome.kind === 'church-only') return;
      if (describeRedemptionOutcome({ outcome }).clearCode) {
        form.setFieldValue('code', '');
      }
    },
  });

  const form = useForm({
    defaultValues: { name: '', password: '', code: '' },
    onSubmit: async ({ value }) => {
      await redeemMutation.mutateAsync(value);
    },
    validators: { onSubmit: redeemFormSchema },
  });

  const cooldownSeconds = remainingCooldownSeconds({ codeSentAt, now });
  const outcome = redeemMutation.data;
  const failure =
    outcome && outcome.kind !== 'full-success' && outcome.kind !== 'church-only'
      ? describeRedemptionOutcome({ outcome })
      : null;

  function finishAtDashboard(): Promise<void> {
    return finishRedemptionAtDashboard({
      queryClient,
      getSession: authClient.getSession,
      navigateToDashboard: () => navigate({ to: '/dashboard' }),
    });
  }

  if (previewQuery.isLoading) {
    return (
      <RedemptionShell>
        <p className="text-muted-foreground text-sm">Loading invitation…</p>
      </RedemptionShell>
    );
  }

  if (previewQuery.isError) {
    const status = isAxiosError(previewQuery.error)
      ? previewQuery.error.response?.status
      : undefined;
    return (
      <RedemptionShell>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p className="text-sm">
            {status === 429
              ? 'Too many requests. Try again in a moment.'
              : 'This invitation is no longer available. It may have expired or already been used.'}
          </p>
        </div>
      </RedemptionShell>
    );
  }

  const preview = previewQuery.data;
  if (!preview) return null;

  if (outcome?.kind === 'full-success') {
    return (
      <RedemptionShell>
        <p className="text-muted-foreground text-sm">
          Welcome! Setting up your account…
        </p>
      </RedemptionShell>
    );
  }

  if (outcome?.kind === 'church-only') {
    return (
      <RedemptionShell>
        <VolunteerTransferFlow
          invitationId={invitationId}
          sourceChurchName={outcome.sourceChurchName}
          destinationChurchName={outcome.destinationChurchName}
          onContinueAsMember={finishAtDashboard}
          onTransferred={finishAtDashboard}
        />
      </RedemptionShell>
    );
  }

  return (
    <RedemptionShell>
      <div className="space-y-1.5 border-border border-b pb-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          Join {preview.churchName}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          You've been invited to serve in{' '}
          <strong>{preview.ministryName}</strong> as a{' '}
          {ACCESS_LEVEL_LABELS[preview.ministryAccessLevel]}
          {preview.roleNames.length > 0
            ? ` (${preview.roleNames.join(', ')})`
            : ''}
          .
        </p>
        <p className="text-muted-foreground text-xs">
          Expires{' '}
          {formatDistanceToNow(new Date(preview.expiresAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      {failure ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">{failure.title}</p>
            <p className="text-muted-foreground">{failure.description}</p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="invitation-email">Email</Label>
          <Input
            id="invitation-email"
            value={preview.email}
            disabled
            readOnly
          />
        </div>

        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-destructive text-xs">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

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
                <p key={error?.message} className="text-destructive text-xs">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="verification-code-request" className="text-xs">
              Verification code
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={requestCodeMutation.isPending || cooldownSeconds > 0}
              onClick={() => requestCodeMutation.mutate()}
            >
              <MailCheck />
              {cooldownSeconds > 0
                ? `Resend in ${cooldownSeconds}s`
                : codeSentAt
                  ? 'Resend code'
                  : 'Send code'}
            </Button>
          </div>
          {requestCodeMutation.isSuccess && !requestCodeMutation.isPending ? (
            <p className="text-muted-foreground text-xs">
              Code sent to {preview.email}.
            </p>
          ) : null}
          {requestCodeMutation.isError ? (
            <p className="text-destructive text-xs">
              {isAxiosError(requestCodeMutation.error) &&
              requestCodeMutation.error.response?.status === 404
                ? 'This invitation is no longer available.'
                : 'Too many requests. Wait a moment before trying again.'}
            </p>
          ) : null}
          <form.Field name="code">
            {(field) => (
              <div className="space-y-1">
                <Input
                  id="verification-code-request"
                  name={field.name}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-xs">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
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
              disabled={
                !canSubmit ||
                isSubmitting ||
                redeemMutation.isPending ||
                failure?.canRetry === false
              }
            >
              {redeemMutation.isPending ? 'Joining…' : 'Join'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </RedemptionShell>
  );
}

interface RedemptionShellProps {
  children: ReactNode;
}

function RedemptionShell({ children }: RedemptionShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <main className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <CalendarClock className="size-5" />
          </div>
          <p className="font-semibold text-[1.05rem] tracking-tight">
            Church CRM
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
