import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatRelative, parseInstant } from '@church/time';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { ArrowRight, CircleAlert, ShieldAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { VolunteerTransferFlow } from '@/features/volunteer-transfer';
import type {
  AcceptMinistryInvitation200,
  DeclineMinistryInvitation200,
  GetMinistryInvitationStatus200,
} from '@/infrastructure/api/churchAPI.schemas';
import { useContinueToChurch } from '@/shared/hooks/use-continue-to-church';
import { useSignOut } from '@/shared/hooks/use-sign-out';
import { randomId } from '@/shared/utils/id';
import { redemptionApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/invitations/ministry/$invitationId',
)({
  component: MinistryInvitationRoute,
});

const THROTTLED_STATUS = 429;

type RedeemableStatus = Extract<
  GetMinistryInvitationStatus200,
  { kind: 'redeemable' }
>;

type AcceptFailure = Exclude<
  AcceptMinistryInvitation200,
  | { kind: 'full-success' }
  | { kind: 'already-accepted' }
  | { kind: 'church-only' }
>;

type DeclineFailure = Exclude<
  DeclineMinistryInvitation200,
  { kind: 'declined' }
>;

interface AcceptFailureDescription {
  title: string;
  description: string;
  canRetry: boolean;
}

interface DescribeAcceptFailureInput {
  outcome: AcceptFailure;
}

function describeAcceptFailure({
  outcome,
}: DescribeAcceptFailureInput): AcceptFailureDescription {
  if (outcome.kind === 'retryable-failure') {
    return {
      title: m.common_generic_error_title(),
      description: m.ministry_invitation_accept_retry_description(),
      canRetry: true,
    };
  }
  return {
    title: m.ministry_invitation_unavailable_title(),
    description: m.ministry_invitation_unavailable_description(),
    canRetry: false,
  };
}

interface DescribeDeclineFailureInput {
  outcome: DeclineFailure;
}

function describeDeclineFailure({
  outcome,
}: DescribeDeclineFailureInput): string {
  return outcome.kind === 'identity-mismatch'
    ? m.ministry_invitation_wrong_login_title()
    : m.ministry_invitation_unavailable_title();
}

interface ReturnTargetInput {
  invitationId: string;
}

function returnTarget({ invitationId }: ReturnTargetInput): string {
  return `/invitations/ministry/${invitationId}`;
}

function MinistryInvitationRoute() {
  const { invitationId } = Route.useParams();
  // The path's own segments are not crumbs: Home › Ministry invitation.
  const breadcrumbOverrides = [
    { segment: 'invitations', label: null },
    { segment: 'ministry', label: null },
    { segment: invitationId, label: m.breadcrumb_ministry_invitation() },
  ];

  return (
    <AppShell breadcrumbOverrides={breadcrumbOverrides} notificationBell={null}>
      <div className="mx-auto w-full max-w-xl space-y-5 p-4 md:p-8">
        <MinistryInvitationContent invitationId={invitationId} />
      </div>
    </AppShell>
  );
}

interface MinistryInvitationContentProps {
  invitationId: string;
}

function MinistryInvitationContent({
  invitationId,
}: MinistryInvitationContentProps) {
  const signOut = useSignOut();
  const [idempotencyKey] = useState(() => randomId());
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['redemption', 'ministry-invitation', invitationId],
    queryFn: () => redemptionApi.getMinistryInvitationStatus(invitationId),
    retry: false,
  });

  const continueToChurch = useContinueToChurch();

  const acceptMutation = useMutation({
    mutationFn: () =>
      redemptionApi.acceptMinistryInvitation(invitationId, {
        idempotencyKey,
      }),
    onSuccess: async (outcome) => {
      if (
        outcome.kind === 'full-success' &&
        statusQuery.data?.kind === 'redeemable'
      ) {
        await continueToChurch({
          homeSearch: { joinedMinistry: statusQuery.data.ministryName },
        });
        return;
      }
      // A double-submit or a second tab accepted first — the invitation is
      // still gone, so finish the same way the already-accepted screen does
      // rather than leaving the caller stuck on a stale form.
      if (outcome.kind === 'already-accepted') {
        await continueToChurch({ churchId: outcome.churchId });
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => redemptionApi.declineMinistryInvitation(invitationId),
    onSuccess: async (outcome) => {
      setConfirmingDecline(false);
      if (outcome.kind === 'declined') {
        await continueToChurch({ homeSearch: { invitationDeclined: true } });
      }
    },
  });

  const continueMutation = useMutation({ mutationFn: continueToChurch });

  const handleLogOut = (): void => {
    signOut({
      to: '/login',
      search: { redirect: returnTarget({ invitationId }) },
    });
  };

  if (statusQuery.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.ministry_invitation_loading()}
      </p>
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

  if (status.kind === 'identity-mismatch') {
    return (
      <WrongLoginNotice
        maskedEmail={status.maskedEmail}
        onLogOut={handleLogOut}
      />
    );
  }

  if (status.kind === 'already-accepted') {
    return (
      <AlreadyAcceptedNotice
        isPending={continueMutation.isPending}
        onContinue={() =>
          continueMutation.mutate({ churchId: status.churchId })
        }
      />
    );
  }

  if (acceptMutation.data?.kind === 'church-only') {
    const split = acceptMutation.data;
    // The User now belongs to both Churches: make the one just joined active.
    const continueToDestination = (): Promise<void> =>
      continueToChurch({ churchId: split.destinationChurchId });
    return (
      <VolunteerTransferFlow
        invitationId={invitationId}
        sourceChurchName={split.sourceChurchName}
        destinationChurchName={split.destinationChurchName}
        onContinueAsMember={continueToDestination}
        onTransferred={continueToDestination}
      />
    );
  }

  const { data: acceptData } = acceptMutation;
  const { data: declineData } = declineMutation;
  return (
    <RedeemableInvitationCard
      status={status}
      confirmingDecline={confirmingDecline}
      isAccepting={acceptMutation.isPending}
      isDeclining={declineMutation.isPending}
      acceptOutcome={
        acceptData &&
        acceptData.kind !== 'full-success' &&
        acceptData.kind !== 'already-accepted'
          ? acceptData
          : null
      }
      declineOutcome={
        declineData && declineData.kind !== 'declined' ? declineData : null
      }
      onAccept={() => acceptMutation.mutate()}
      onRequestDecline={() => setConfirmingDecline(true)}
      onCancelDecline={() => setConfirmingDecline(false)}
      onConfirmDecline={() => declineMutation.mutate()}
    />
  );
}

interface AlertProps {
  children: ReactNode;
}

function Alert({ children }: AlertProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
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

interface WrongLoginNoticeProps {
  maskedEmail: string;
  onLogOut: () => void;
}

function WrongLoginNotice({ maskedEmail, onLogOut }: WrongLoginNoticeProps) {
  return (
    <div className="space-y-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <ShieldAlert className="size-5" />
      </div>
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.ministry_invitation_wrong_login_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.ministry_invitation_wrong_login_description({ maskedEmail })}
      </p>
      <Button onClick={onLogOut}>{m.ministry_invitation_logout()}</Button>
    </div>
  );
}

interface AlreadyAcceptedNoticeProps {
  isPending: boolean;
  onContinue: () => void;
}

function AlreadyAcceptedNotice({
  isPending,
  onContinue,
}: AlreadyAcceptedNoticeProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.ministry_invitation_already_accepted_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.ministry_invitation_already_accepted_description()}
      </p>
      <Button className="w-full" disabled={isPending} onClick={onContinue}>
        {m.ministry_invitation_continue_home()}
        <ArrowRight />
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

interface RedeemableInvitationCardProps {
  status: RedeemableStatus;
  confirmingDecline: boolean;
  isAccepting: boolean;
  isDeclining: boolean;
  acceptOutcome: AcceptFailure | null;
  declineOutcome: DeclineFailure | null;
  onAccept: () => void;
  onRequestDecline: () => void;
  onCancelDecline: () => void;
  onConfirmDecline: () => void;
}

function RedeemableInvitationCard({
  status,
  confirmingDecline,
  isAccepting,
  isDeclining,
  acceptOutcome,
  declineOutcome,
  onAccept,
  onRequestDecline,
  onCancelDecline,
  onConfirmDecline,
}: RedeemableInvitationCardProps) {
  const { ministryName, churchName, roleNames, ministryAccessLevel } = status;
  const acceptFailure = acceptOutcome
    ? describeAcceptFailure({ outcome: acceptOutcome })
    : null;
  const accessLevelLabel =
    ministryAccessLevel === 'leader'
      ? m.ministry_invitation_access_leader()
      : m.ministry_invitation_access_volunteer();
  const rolesLabel =
    roleNames.length > 0
      ? roleNames.join(', ')
      : m.ministry_invitation_roles_none();
  const declineNotice =
    status.invitationKind === 'chained'
      ? m.ministry_invitation_decline_notice_chained()
      : m.ministry_invitation_decline_notice_ministry_only({ ministryName });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 border-border border-b pb-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          {m.ministry_invitation_title({ ministryName })}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          {m.ministry_invitation_intro({ churchName })}
        </p>
        <p className="text-muted-foreground text-xs">
          {m.ministry_invitation_expires({
            when: formatRelative({
              instant: parseInstant({ value: status.expiresAt }),
              timeZone: 'UTC',
              locale: getLocale(),
            }),
          })}
        </p>
      </div>

      <dl className="space-y-2">
        <InvitationFact
          label={m.ministry_invitation_ministry_label()}
          value={ministryName}
        />
        <InvitationFact
          label={m.ministry_invitation_access_level_label()}
          value={accessLevelLabel}
        />
        <InvitationFact
          label={m.ministry_invitation_roles_label()}
          value={rolesLabel}
        />
      </dl>

      {acceptFailure ? (
        <Alert>
          <p className="font-medium">{acceptFailure.title}</p>
          <p className="text-muted-foreground">{acceptFailure.description}</p>
        </Alert>
      ) : null}

      {declineOutcome ? (
        <Alert>{describeDeclineFailure({ outcome: declineOutcome })}</Alert>
      ) : null}

      <Button
        className="w-full"
        disabled={
          isAccepting || (acceptFailure ? !acceptFailure.canRetry : false)
        }
        onClick={onAccept}
      >
        {isAccepting
          ? m.ministry_invitation_accepting()
          : m.ministry_invitation_accept()}
      </Button>

      {confirmingDecline ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm">{declineNotice}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={isDeclining}
              onClick={onCancelDecline}
            >
              {m.ministry_invitation_decline_cancel()}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeclining}
              onClick={onConfirmDecline}
            >
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
          onClick={onRequestDecline}
        >
          {m.ministry_invitation_decline()}
        </Button>
      )}
    </div>
  );
}
