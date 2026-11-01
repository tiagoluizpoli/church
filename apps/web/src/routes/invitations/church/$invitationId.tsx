import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatRelative, nowAsDate, parseInstant } from '@church/time';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { CalendarClock, CircleAlert, MailCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  PreviewChurchInvitation200,
  PreviewChurchInvitation200ChurchAccessLevel,
  PreviewChurchInvitation200MinistryMinistryAccessLevel,
  RedeemChurchInvitation200,
} from '@/infrastructure/api/churchAPI.schemas';
import { authClient } from '@/lib/auth-client';
import { finishRedemptionAtHome } from '@/shared/utils/active-church-switch';
import type { churchOnlyWarningSearchSchema } from '@/shared/utils/church-only-warning';
import { randomId } from '@/shared/utils/id';
import { redemptionApi } from '@/utils/api-instances';

export const Route = createFileRoute('/invitations/church/$invitationId')({
  component: ChurchInvitationJoinRoute,
});

const MIN_PASSWORD_LENGTH = 8;
const MS_PER_SECOND = 1000;

// Built per render so validation messages follow the active locale.
function joinFormSchema() {
  return z.object({
    code: z.string().regex(/^\d{6}$/, m.join_validation_code()),
    name: z.string().trim().min(1, m.join_validation_name()),
    password: z.string().min(MIN_PASSWORD_LENGTH, m.join_validation_password()),
  });
}

type JoinFormValues = z.infer<ReturnType<typeof joinFormSchema>>;

type ChurchOnlyWarningSearch = z.infer<typeof churchOnlyWarningSearchSchema>;

const CHURCH_ACCESS_LABELS: Record<
  PreviewChurchInvitation200ChurchAccessLevel,
  () => string
> = {
  member: m.join_church_access_member,
  admin: m.join_church_access_admin,
};

const MINISTRY_ACCESS_LABELS: Record<
  PreviewChurchInvitation200MinistryMinistryAccessLevel,
  () => string
> = {
  volunteer: m.join_ministry_access_volunteer,
  leader: m.join_ministry_access_leader,
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
  const { resendCooldownMs } = appConfig.verificationCode;
  const remainingMs = resendCooldownMs - (now - codeSentAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / MS_PER_SECOND) : 0;
}

interface StatusOfInput {
  error: unknown;
}

function statusOf({ error }: StatusOfInput): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
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
  // Retryable failures rolled every write back, so the same form can resubmit.
  if (outcome.kind === 'retryable-failure') {
    return {
      title: m.common_generic_error_title(),
      description: m.redemption_failure_retryable_description(),
      canRetry: true,
      clearCode: false,
    };
  }
  if (outcome.reason === 'VERIFICATION_FAILED') {
    return {
      title: m.redemption_failure_code_title(),
      description: m.redemption_failure_code_description(),
      canRetry: true,
      clearCode: true,
    };
  }
  if (outcome.reason === 'EMAIL_ALREADY_REGISTERED') {
    return {
      title: m.redemption_failure_registered_title(),
      description: m.redemption_failure_registered_description(),
      canRetry: false,
      clearCode: false,
    };
  }
  return {
    title: m.redemption_failure_unavailable_title(),
    description: m.redemption_failure_unavailable_description(),
    canRetry: false,
    clearCode: false,
  };
}

/**
 * The public join page for a plain or paired Church Invitation, outside the
 * app shell. Step 1 reviews the invitation and sends a code to the addressed
 * email; step 2 takes the code, name and password.
 */
function ChurchInvitationJoinRoute() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => randomId());
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => nowAsDate().getTime());

  useEffect(() => {
    if (!codeSentAt) return;
    const interval = setInterval(
      () => setNow(nowAsDate().getTime()),
      MS_PER_SECOND,
    );
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
    onSuccess: () => {
      const sentAt = nowAsDate().getTime();
      setNow(sentAt);
      setCodeSentAt(sentAt);
    },
  });

  function finishAtHome(search?: ChurchOnlyWarningSearch): Promise<void> {
    return finishRedemptionAtHome({
      queryClient,
      getSession: authClient.getSession,
      navigateToHome: () => navigate({ to: '/', search }),
    });
  }

  const declineMutation = useMutation({
    mutationFn: () => redemptionApi.declineChurchInvitation(invitationId),
    onSettled: () => setConfirmingDecline(false),
  });

  const redeemMutation = useMutation({
    mutationFn: (values: JoinFormValues) =>
      redemptionApi.redeemChurchInvitation(invitationId, {
        ...values,
        idempotencyKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.kind === 'full-success') {
        await finishAtHome();
        return;
      }
      // Committed: the Church Membership stands, so Home warns about the Ministry.
      if (outcome.kind === 'church-only') {
        await finishAtHome({
          joinedChurch: outcome.destinationChurchName,
          invitedMinistry: outcome.ministryName,
        });
        return;
      }
      if (describeRedemptionOutcome({ outcome }).clearCode) {
        form.setFieldValue('code', '');
      }
    },
  });

  const form = useForm({
    defaultValues: { code: '', name: '', password: '' },
    onSubmit: async ({ value }) => {
      await redeemMutation.mutateAsync(value);
    },
    validators: { onSubmit: joinFormSchema() },
  });

  if (previewQuery.isLoading) {
    return (
      <RedemptionShell>
        <p className="text-muted-foreground text-sm">{m.join_loading()}</p>
      </RedemptionShell>
    );
  }

  if (previewQuery.isError) {
    return (
      <RedemptionShell>
        {statusOf({ error: previewQuery.error }) === 429 ? (
          <Notice title={m.join_too_many_requests()} />
        ) : (
          <UnavailableNotice />
        )}
      </RedemptionShell>
    );
  }

  const preview = previewQuery.data;
  if (!preview) return null;

  if (declineMutation.isSuccess) {
    return (
      <RedemptionShell>
        <div className="space-y-1.5">
          <h1 className="font-semibold text-2xl tracking-tight">
            {m.join_declined_title()}
          </h1>
          <p className="text-muted-foreground text-sm">
            {m.join_declined_description()}
          </p>
        </div>
      </RedemptionShell>
    );
  }

  if (
    declineMutation.isError &&
    statusOf({ error: declineMutation.error }) !== 429
  ) {
    return (
      <RedemptionShell>
        <UnavailableNotice />
      </RedemptionShell>
    );
  }

  const outcome = redeemMutation.data;
  if (outcome?.kind === 'full-success' || outcome?.kind === 'church-only') {
    return (
      <RedemptionShell>
        <p className="text-muted-foreground text-sm">{m.join_welcome()}</p>
      </RedemptionShell>
    );
  }

  const failure = outcome ? describeRedemptionOutcome({ outcome }) : null;
  const cooldownSeconds = remainingCooldownSeconds({ codeSentAt, now });
  const declineThrottled = declineMutation.isError;
  const codeRequestThrottled =
    requestCodeMutation.isError &&
    statusOf({ error: requestCodeMutation.error }) !== 404;
  const codeRequestUnavailable =
    requestCodeMutation.isError &&
    statusOf({ error: requestCodeMutation.error }) === 404;

  if (codeRequestUnavailable) {
    return (
      <RedemptionShell>
        <UnavailableNotice />
      </RedemptionShell>
    );
  }

  return (
    <RedemptionShell>
      <InvitationSummary preview={preview} />

      {codeSentAt === null ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="invitation-email">{m.join_email_label()}</Label>
            <Input id="invitation-email" value={preview.email} readOnly />
          </div>
          {codeRequestThrottled || declineThrottled ? (
            <Notice title={m.join_too_many_requests()} />
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={requestCodeMutation.isPending}
            onClick={() => requestCodeMutation.mutate()}
          >
            <MailCheck />
            {requestCodeMutation.isPending
              ? m.join_sending_code()
              : m.join_send_code()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={declineMutation.isPending}
            onClick={() => setConfirmingDecline(true)}
          >
            {m.join_decline()}
          </Button>
          <AlertDialog
            open={confirmingDecline}
            onOpenChange={setConfirmingDecline}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.join_decline_confirm_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.join_decline_confirm_description()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.join_decline_cancel()}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={declineMutation.isPending}
                  onClick={() => declineMutation.mutate()}
                >
                  {declineMutation.isPending
                    ? m.join_declining()
                    : m.join_decline_confirm()}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <p className="text-muted-foreground text-sm">
            {m.join_code_sent({ email: preview.email })}
          </p>

          {failure ? (
            <Notice title={failure.title} description={failure.description} />
          ) : null}

          <form.Field name="code">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={field.name}>{m.join_code_label()}</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    disabled={
                      requestCodeMutation.isPending || cooldownSeconds > 0
                    }
                    onClick={() => requestCodeMutation.mutate()}
                  >
                    {cooldownSeconds > 0
                      ? m.join_resend_in({ seconds: String(cooldownSeconds) })
                      : m.join_resend_code()}
                  </Button>
                </div>
                <Input
                  id={field.name}
                  name={field.name}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldErrors errors={field.state.meta.errors} />
                {codeRequestThrottled ? (
                  <p className="text-destructive text-xs">
                    {m.join_too_many_requests()}
                  </p>
                ) : null}
              </div>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{m.join_name_label()}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldErrors errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{m.join_password_label()}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {field.state.meta.errors.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {m.join_password_hint()}
                  </p>
                ) : (
                  <FieldErrors errors={field.state.meta.errors} />
                )}
              </div>
            )}
          </form.Field>

          <Button
            type="submit"
            className="w-full"
            disabled={redeemMutation.isPending || failure?.canRetry === false}
          >
            {redeemMutation.isPending
              ? m.join_submitting()
              : outcome?.kind === 'retryable-failure'
                ? m.redemption_try_again()
                : m.join_submit()}
          </Button>
        </form>
      )}
    </RedemptionShell>
  );
}

interface InvitationSummaryProps {
  preview: PreviewChurchInvitation200;
}

function InvitationSummary({ preview }: InvitationSummaryProps) {
  const { ministry } = preview;
  return (
    <div className="space-y-1.5 border-border border-b pb-4">
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.join_title({ churchName: preview.churchName })}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.join_church_access({
          accessLevel: CHURCH_ACCESS_LABELS[preview.churchAccessLevel](),
        })}
      </p>
      {ministry ? (
        <div className="space-y-0.5 text-sm">
          <p className="text-pretty">
            {m.join_ministry_access({
              ministryName: ministry.name,
              accessLevel:
                MINISTRY_ACCESS_LABELS[ministry.ministryAccessLevel](),
            })}
          </p>
          {ministry.roleNames.length > 0 ? (
            <p className="text-muted-foreground">
              {m.join_ministry_roles({ roles: ministry.roleNames.join(', ') })}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {m.join_expires({
          relative: formatRelative({
            instant: parseInstant({ value: preview.expiresAt }),
            timeZone: 'UTC',
            locale: getLocale(),
          }),
        })}
      </p>
    </div>
  );
}

interface FieldError {
  message?: string;
}

interface FieldErrorsProps {
  errors: ReadonlyArray<FieldError | undefined>;
}

function FieldErrors({ errors }: FieldErrorsProps) {
  return errors.map((error) => (
    <p key={error?.message} className="text-destructive text-xs">
      {error?.message}
    </p>
  ));
}

interface NoticeProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

function Notice({ title, description, children }: NoticeProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function UnavailableNotice() {
  return (
    <Notice
      title={m.redemption_failure_unavailable_title()}
      description={m.redemption_failure_unavailable_description()}
    >
      <Link to="/login" className="font-medium text-primary underline">
        {m.join_log_in()}
      </Link>
    </Notice>
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
            {appConfig.appName}
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
