import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatRelative, parseInstant } from '@church/time';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { ArrowRight, CircleAlert, ShieldAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type {
  AcceptChurchInvitation200,
  GetChurchInvitationReviewStatus200,
} from '@/infrastructure/api/churchAPI.schemas';
import { useContinueToChurch } from '@/shared/hooks/use-continue-to-church';
import { useSignOut } from '@/shared/hooks/use-sign-out';
import { randomId } from '@/shared/utils/id';
import { redemptionApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/invitations/church/$invitationId/review',
)({
  component: ChurchInvitationReviewRoute,
});

const THROTTLED_STATUS = 429;

type RedeemableStatus = Extract<
  GetChurchInvitationReviewStatus200,
  { kind: 'redeemable' }
>;

type AcceptFailure = Extract<
  AcceptChurchInvitation200,
  { kind: 'retryable-failure' | 'terminal-failure' | 'identity-mismatch' }
>;

const CHURCH_ACCESS_LABELS: Record<
  RedeemableStatus['churchAccessLevel'],
  () => string
> = {
  member: m.join_church_access_member,
  admin: m.join_church_access_admin,
};

interface ReturnTargetInput {
  invitationId: string;
}

function returnTarget({ invitationId }: ReturnTargetInput): string {
  return `/invitations/church/${invitationId}/review`;
}

function ChurchInvitationReviewRoute() {
  const { invitationId } = Route.useParams();
  // The path's own segments are not crumbs: Home › Church invitation.
  const breadcrumbOverrides = [
    { segment: 'invitations', label: null },
    { segment: 'church', label: null },
    { segment: invitationId, label: m.breadcrumb_church_invitation() },
    { segment: 'review', label: null },
  ];

  return (
    <AppShell breadcrumbOverrides={breadcrumbOverrides} notificationBell={null}>
      <div className="mx-auto w-full max-w-xl space-y-5 p-4 md:p-8">
        <ChurchInvitationReviewContent invitationId={invitationId} />
      </div>
    </AppShell>
  );
}

interface ChurchInvitationReviewContentProps {
  invitationId: string;
}

function ChurchInvitationReviewContent({
  invitationId,
}: ChurchInvitationReviewContentProps) {
  const signOut = useSignOut();
  const [idempotencyKey] = useState(() => randomId());
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['redemption', 'church-invitation', invitationId],
    queryFn: () => redemptionApi.getChurchInvitationReviewStatus(invitationId),
  });

  const continueToChurch = useContinueToChurch();

  const acceptMutation = useMutation({
    mutationFn: (reviewToken: string) =>
      redemptionApi.acceptChurchInvitation(invitationId, {
        idempotencyKey,
        reviewToken,
      }),
    onSuccess: async (outcome) => {
      // Nothing was granted: show the refreshed offer for a fresh acceptance.
      if (outcome.kind === 'offer-changed') {
        await statusQuery.refetch();
        return;
      }
      // A double-submit or a second tab accepted first: finish the same way.
      if (
        outcome.kind === 'full-success' ||
        outcome.kind === 'already-accepted'
      ) {
        await continueToChurch({ churchId: outcome.churchId });
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => redemptionApi.declineChurchInvitation(invitationId),
    onSuccess: () => setConfirmingDecline(false),
  });

  const continueMutation = useMutation({ mutationFn: continueToChurch });

  const handleLogOut = (): void => {
    signOut({
      to: '/login',
      search: { redirect: returnTarget({ invitationId }) },
    });
  };

  if (declineMutation.data?.kind === 'declined') {
    return (
      <div className="space-y-1.5" role="status">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.join_declined_title()}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.join_declined_description()}
        </p>
      </div>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <Pending label={m.ministry_invitation_loading()} className="space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
      </Pending>
    );
  }

  if (statusQuery.isError) {
    const throttled =
      isAxiosError(statusQuery.error) &&
      statusQuery.error.response?.status === THROTTLED_STATUS;
    return throttled ? (
      <ThrottledNotice onRetry={() => statusQuery.refetch()} />
    ) : (
      <UnavailableNotice invitationId={invitationId} />
    );
  }

  const status = statusQuery.data;

  if (!status || status.kind === 'unavailable') {
    return <UnavailableNotice invitationId={invitationId} />;
  }

  // A pending Ministry half: the Ministry review covers the whole offer.
  if (status.kind === 'paired') {
    return (
      <Navigate
        to="/invitations/ministry/$invitationId"
        params={{ invitationId: status.ministryInvitationId }}
        replace
      />
    );
  }

  if (status.kind === 'identity-mismatch') {
    return (
      <div className="space-y-4">
        <div className="flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="size-5" />
        </div>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.ministry_invitation_wrong_login_title()}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.ministry_invitation_wrong_login_description({
            maskedEmail: status.maskedEmail,
          })}
        </p>
        <Button onClick={handleLogOut}>{m.ministry_invitation_logout()}</Button>
      </div>
    );
  }

  if (status.kind === 'already-accepted') {
    return (
      <div className="space-y-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.ministry_invitation_already_accepted_title()}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.ministry_invitation_already_accepted_description()}
        </p>
        <Button
          className="w-full"
          disabled={continueMutation.isPending}
          onClick={() => continueMutation.mutate({ churchId: status.churchId })}
        >
          {m.ministry_invitation_continue_home()}
          {continueMutation.isPending ? <Spinner /> : <ArrowRight />}
        </Button>
      </div>
    );
  }

  const { data: acceptData } = acceptMutation;
  const acceptFailure: AcceptFailure | null =
    acceptData &&
    (acceptData.kind === 'retryable-failure' ||
      acceptData.kind === 'terminal-failure' ||
      acceptData.kind === 'identity-mismatch')
      ? acceptData
      : null;

  if (acceptFailure?.kind === 'identity-mismatch') {
    return (
      <div className="space-y-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.ministry_invitation_wrong_login_title()}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.ministry_invitation_wrong_login_description({
            maskedEmail: acceptFailure.maskedEmail,
          })}
        </p>
        <Button onClick={handleLogOut}>{m.ministry_invitation_logout()}</Button>
      </div>
    );
  }

  const canRetry = acceptFailure?.kind !== 'terminal-failure';
  // Stay busy through the hop home after a grant so a second click can't fire.
  const isAccepting =
    acceptMutation.isPending || acceptData?.kind === 'full-success';
  const isDeclining = declineMutation.isPending;
  const expiresIn = formatRelative({
    instant: parseInstant({ value: status.expiresAt }),
    timeZone: 'UTC',
    locale: getLocale(),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 border-border border-b pb-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.church_invitation_review_title({ churchName: status.churchName })}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.church_invitation_review_intro({ churchName: status.churchName })}
        </p>
      </div>

      <div role="status" className="empty:hidden">
        {acceptData?.kind === 'offer-changed' ? (
          <Alert>
            <p className="font-medium">
              {m.ministry_invitation_offer_changed_title()}
            </p>
            <p className="text-muted-foreground">
              {m.ministry_invitation_offer_changed_description()}
            </p>
          </Alert>
        ) : null}
      </div>

      <dl className="space-y-2">
        <InvitationFact
          label={m.ministry_invitation_church_label()}
          value={status.churchName}
        />
        <InvitationFact
          label={m.ministry_invitation_church_access_label()}
          value={CHURCH_ACCESS_LABELS[status.churchAccessLevel]()}
        />
        <InvitationFact
          label={m.church_invitation_review_expires_label()}
          value={expiresIn}
        />
      </dl>

      {acceptFailure ? (
        <Alert>
          <p className="font-medium">
            {canRetry
              ? m.common_generic_error_title()
              : m.ministry_invitation_unavailable_title()}
          </p>
          <p className="text-muted-foreground">
            {canRetry
              ? m.church_invitation_review_accept_retry_description()
              : m.ministry_invitation_unavailable_description()}
          </p>
        </Alert>
      ) : null}

      {declineMutation.isError ? (
        <Alert>{m.ministry_invitation_unavailable_title()}</Alert>
      ) : null}

      <Button
        className="w-full"
        disabled={isAccepting || !canRetry}
        onClick={() => acceptMutation.mutate(status.reviewToken)}
      >
        {isAccepting ? <Spinner /> : null}
        {isAccepting
          ? m.ministry_invitation_accepting()
          : m.ministry_invitation_accept()}
      </Button>

      {confirmingDecline ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm">
            {m.church_invitation_review_decline_notice()}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={isDeclining}
              onClick={() => setConfirmingDecline(false)}
            >
              {m.ministry_invitation_decline_cancel()}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeclining}
              onClick={() => declineMutation.mutate()}
            >
              {isDeclining ? <Spinner /> : null}
              {isDeclining
                ? m.ministry_invitation_declining()
                : m.ministry_invitation_decline_confirm()}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="w-full"
          disabled={isAccepting}
          onClick={() => setConfirmingDecline(true)}
        >
          {m.ministry_invitation_decline()}
        </Button>
      )}
    </div>
  );
}

interface AlertProps {
  children: ReactNode;
}

function Alert({ children }: AlertProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="text-sm">{children}</div>
    </div>
  );
}

interface UnavailableNoticeProps {
  invitationId: string;
}

function UnavailableNotice({ invitationId }: UnavailableNoticeProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <p className="font-medium">
          {m.ministry_invitation_unavailable_title()}
        </p>
        <p className="text-muted-foreground">
          {m.ministry_invitation_unavailable_description()}
        </p>
      </Alert>
      <Link
        to="/login"
        search={{ redirect: returnTarget({ invitationId }) }}
        className="inline-flex min-h-11 items-center font-medium text-primary text-sm underline-offset-4 hover:underline"
      >
        {m.ministry_invitation_login()}
      </Link>
    </div>
  );
}

interface ThrottledNoticeProps {
  onRetry: () => void;
}

function ThrottledNotice({ onRetry }: ThrottledNoticeProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <p className="font-medium">{m.ministry_invitation_throttled_title()}</p>
        <p className="text-muted-foreground">
          {m.ministry_invitation_throttled_description()}
        </p>
      </Alert>
      <Button variant="outline" onClick={onRetry}>
        {m.ministry_invitation_retry()}
      </Button>
    </div>
  );
}

interface InvitationFactProps {
  label: string;
  value: string;
}

function InvitationFact({ label, value }: InvitationFactProps) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}
