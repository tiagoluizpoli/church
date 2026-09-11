import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  ShieldAlert,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VolunteerTransferFlow } from '@/features/volunteer-transfer';
import type {
  AcceptMinistryInvitation200,
  DeclineMinistryInvitation200,
  GetMinistryInvitationStatus200,
  ListActiveChurchOptions200ChurchesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { authClient } from '@/lib/auth-client';
import {
  finishRedemptionAtDashboard,
  switchActiveChurch,
} from '@/shared/utils/active-church-switch';
import { activeChurchApi, redemptionApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/invitations/ministry/$invitationId',
)({
  component: MinistryInvitationRoute,
});

const ACCESS_LEVEL_LABELS: Record<'volunteer' | 'leader', string> = {
  volunteer: 'Volunteer',
  leader: 'Leader',
};

type RedeemableStatus = Extract<
  GetMinistryInvitationStatus200,
  { kind: 'redeemable' }
>;

interface ChurchLookupInput {
  churchId?: string;
  churchName?: string;
}

interface ResolveChurchOptionInput extends ChurchLookupInput {
  churches: ListActiveChurchOptions200ChurchesItem[];
}

function resolveChurchOption({
  churches,
  churchId,
  churchName,
}: ResolveChurchOptionInput):
  | ListActiveChurchOptions200ChurchesItem
  | undefined {
  if (churchId) return churches.find((church) => church.churchId === churchId);
  if (churchName) return churches.find((church) => church.name === churchName);
  return undefined;
}

interface AcceptFailureDescription {
  title: string;
  description: string;
  canRetry: boolean;
}

interface DescribeAcceptFailureInput {
  outcome: Exclude<
    AcceptMinistryInvitation200,
    | { kind: 'full-success' }
    | { kind: 'already-accepted' }
    | { kind: 'church-only' }
  >;
}

function describeAcceptFailure({
  outcome,
}: DescribeAcceptFailureInput): AcceptFailureDescription {
  if (outcome.kind === 'identity-mismatch') {
    return {
      title: 'This invitation belongs to another account',
      description: 'Reload the page to see the current state.',
      canRetry: false,
    };
  }
  if (outcome.kind === 'retryable-failure') {
    return {
      title: 'Something went wrong',
      description: "We couldn't finish adding you to the Ministry. Try again.",
      canRetry: true,
    };
  }
  return {
    title: 'This invitation is no longer available',
    description:
      'It may have expired or already been used. Ask your Ministry leader for a new invitation.',
    canRetry: false,
  };
}

interface DescribeDeclineFailureInput {
  outcome: Exclude<DeclineMinistryInvitation200, { kind: 'declined' }>;
}

function describeDeclineFailure({
  outcome,
}: DescribeDeclineFailureInput): string {
  if (outcome.kind === 'identity-mismatch') {
    return 'This invitation belongs to another account. Reload the page to see the current state.';
  }
  return 'This invitation is no longer available.';
}

function MinistryInvitationRoute() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['redemption', 'ministry-invitation', invitationId],
    queryFn: () => redemptionApi.getMinistryInvitationStatus(invitationId),
  });

  async function continueToChurch(input: ChurchLookupInput): Promise<void> {
    const { churches } = await activeChurchApi.listActiveChurchOptions();
    const church = resolveChurchOption({ churches, ...input });
    if (!church) {
      navigate({ to: '/dashboard' });
      return;
    }
    await switchActiveChurch({
      availableAreas: church.availableAreas,
      churchId: church.churchId,
      churchName: church.name,
      destination: '/dashboard',
      navigate: ({ destination }) => navigate({ to: destination }),
      queryClient,
      selectActiveChurch: async ({ churchId }) => {
        await activeChurchApi.selectActiveChurch({ churchId });
      },
    });
  }

  const continueMutation = useMutation({
    mutationFn: continueToChurch,
  });

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
        await continueToChurch({ churchName: statusQuery.data.churchName });
        return;
      }
      // A double-submit or a second tab accepted first — the invitation is
      // still gone, so finish the same way the already-accepted screen does
      // rather than leaving the caller stuck on a stale form (spec §7.3).
      if (outcome.kind === 'already-accepted') {
        await continueToChurch({ churchId: outcome.churchId });
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => redemptionApi.declineMinistryInvitation(invitationId),
    onSuccess: () => setConfirmingDecline(false),
  });

  const handleSwitchAccount = (): void => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () =>
          navigate({
            to: '/login',
            search: { redirect: `/invitations/ministry/${invitationId}` },
          }),
      },
    });
  };

  if (statusQuery.isLoading) {
    return (
      <InvitationShell>
        <p className="text-muted-foreground text-sm">Loading invitation…</p>
      </InvitationShell>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <InvitationShell>
        <UnavailableNotice />
      </InvitationShell>
    );
  }

  const status = statusQuery.data;

  if (status.kind === 'unavailable') {
    return (
      <InvitationShell>
        <UnavailableNotice />
      </InvitationShell>
    );
  }

  if (status.kind === 'identity-mismatch') {
    return (
      <InvitationShell>
        <WrongAccountNotice
          confirming={confirmingSwitch}
          onRequestSwitch={() => setConfirmingSwitch(true)}
          onCancelSwitch={() => setConfirmingSwitch(false)}
          onConfirmSwitch={handleSwitchAccount}
        />
      </InvitationShell>
    );
  }

  if (status.kind === 'already-accepted') {
    return (
      <InvitationShell>
        <AlreadyAcceptedNotice
          isPending={continueMutation.isPending}
          onContinue={() =>
            continueMutation.mutate({ churchId: status.churchId })
          }
        />
      </InvitationShell>
    );
  }

  if (declineMutation.data?.kind === 'declined') {
    return (
      <InvitationShell>
        <DeclinedNotice
          onGoToDashboard={() => navigate({ to: '/dashboard' })}
        />
      </InvitationShell>
    );
  }

  if (acceptMutation.data?.kind === 'church-only') {
    const split = acceptMutation.data;
    const finishAtDashboard = (): Promise<void> =>
      finishRedemptionAtDashboard({
        queryClient,
        getSession: authClient.getSession,
        navigateToDashboard: () => navigate({ to: '/dashboard' }),
      });
    return (
      <InvitationShell>
        <VolunteerTransferFlow
          invitationId={invitationId}
          sourceChurchName={split.sourceChurchName}
          destinationChurchName={split.destinationChurchName}
          onContinueAsMember={finishAtDashboard}
          onTransferred={finishAtDashboard}
        />
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <RedeemableInvitationCard
        status={status}
        confirmingDecline={confirmingDecline}
        isAccepting={acceptMutation.isPending}
        isDeclining={declineMutation.isPending}
        acceptOutcome={
          acceptMutation.data?.kind &&
          acceptMutation.data.kind !== 'full-success' &&
          acceptMutation.data.kind !== 'already-accepted'
            ? acceptMutation.data
            : null
        }
        declineOutcome={
          declineMutation.data?.kind === 'terminal-failure' ||
          declineMutation.data?.kind === 'identity-mismatch'
            ? declineMutation.data
            : null
        }
        onAccept={() => acceptMutation.mutate()}
        onRequestDecline={() => setConfirmingDecline(true)}
        onCancelDecline={() => setConfirmingDecline(false)}
        onConfirmDecline={() => declineMutation.mutate()}
      />
    </InvitationShell>
  );
}

function UnavailableNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <p className="text-sm">
        This invitation is no longer available. It may have expired or already
        been used.
      </p>
    </div>
  );
}

interface DeclinedNoticeProps {
  onGoToDashboard: () => void;
}

function DeclinedNotice({ onGoToDashboard }: DeclinedNoticeProps) {
  return (
    <div className="space-y-4">
      <p className="text-pretty text-sm">You've declined this invitation.</p>
      <Button variant="outline" className="w-full" onClick={onGoToDashboard}>
        Go to dashboard
      </Button>
    </div>
  );
}

interface WrongAccountNoticeProps {
  confirming: boolean;
  onRequestSwitch: () => void;
  onCancelSwitch: () => void;
  onConfirmSwitch: () => void;
}

function WrongAccountNotice({
  confirming,
  onRequestSwitch,
  onCancelSwitch,
  onConfirmSwitch,
}: WrongAccountNoticeProps) {
  return (
    <div className="space-y-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <ShieldAlert className="size-5" />
      </div>
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        This invitation belongs to another account
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        You're signed in as a different person than the one this invitation was
        sent to. Switch accounts to accept it.
      </p>
      {confirming ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm">
            You'll be signed out and returned to sign-in. Your current session
            won't change until you sign in again.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancelSwitch}>
              Cancel
            </Button>
            <Button onClick={onConfirmSwitch}>Sign out and switch</Button>
          </div>
        </div>
      ) : (
        <Button onClick={onRequestSwitch}>Switch account</Button>
      )}
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
        You've already accepted this invitation
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        There's nothing left to do here — continue into your Church.
      </p>
      <Button className="w-full" disabled={isPending} onClick={onContinue}>
        Continue to Church
        <ArrowRight />
      </Button>
    </div>
  );
}

interface RedeemableInvitationCardProps {
  status: RedeemableStatus;
  confirmingDecline: boolean;
  isAccepting: boolean;
  isDeclining: boolean;
  acceptOutcome: Exclude<
    AcceptMinistryInvitation200,
    | { kind: 'full-success' }
    | { kind: 'already-accepted' }
    | { kind: 'church-only' }
  > | null;
  declineOutcome: Exclude<
    DeclineMinistryInvitation200,
    { kind: 'declined' }
  > | null;
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
  const acceptFailure = acceptOutcome
    ? describeAcceptFailure({ outcome: acceptOutcome })
    : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 border-border border-b pb-4">
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          Join {status.ministryName}
        </h1>
        <p className="text-pretty text-muted-foreground text-sm">
          You've been invited to serve in <strong>{status.ministryName}</strong>{' '}
          at <strong>{status.churchName}</strong> as a{' '}
          {ACCESS_LEVEL_LABELS[status.ministryAccessLevel]}
          {status.roleNames.length > 0
            ? ` (${status.roleNames.join(', ')})`
            : ''}
          .
        </p>
        <p className="text-muted-foreground text-xs">
          Expires{' '}
          {formatDistanceToNow(new Date(status.expiresAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invitation-email">Email</Label>
        <Input id="invitation-email" value={status.email} disabled readOnly />
      </div>

      {acceptFailure ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">{acceptFailure.title}</p>
            <p className="text-muted-foreground">{acceptFailure.description}</p>
          </div>
        </div>
      ) : null}

      {declineOutcome ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p className="text-sm">
            {describeDeclineFailure({ outcome: declineOutcome })}
          </p>
        </div>
      ) : null}

      <Button
        className="w-full"
        disabled={
          isAccepting || (acceptFailure ? !acceptFailure.canRetry : false)
        }
        onClick={onAccept}
      >
        {isAccepting ? 'Joining…' : 'Accept'}
      </Button>

      {confirmingDecline ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm">
            {status.invitationKind === 'chained'
              ? "Declining will also cancel your Church invitation — you won't be able to accept it later without a new invitation."
              : `Declining will cancel only your invitation to ${status.ministryName}. Your Church access is not affected.`}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={isDeclining}
              onClick={onCancelDecline}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeclining}
              onClick={onConfirmDecline}
            >
              {isDeclining ? 'Declining…' : 'Yes, decline'}
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
          Decline
        </Button>
      )}
    </div>
  );
}

interface InvitationShellProps {
  children: ReactNode;
}

function InvitationShell({ children }: InvitationShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <CalendarClock className="size-5" />
            </div>
            <p className="font-semibold text-[1.05rem] tracking-tight">
              Church CRM
            </p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
