import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowRight, CircleAlert, Repeat2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  ConfirmVolunteerTransfer200,
  GetVolunteerTransferPreview200,
} from '@/infrastructure/api/churchAPI.schemas';
import { redemptionApi } from '@/utils/api-instances';

type ReviewablePreview = Extract<
  GetVolunteerTransferPreview200,
  { kind: 'reviewable' }
>;

type Step = 'split' | 'review' | 'confirm';

export interface VolunteerTransferFlowProps {
  invitationId: string;
  /** The Church whose active Volunteer profile blocked the Ministry grant. */
  sourceChurchName: string;
  /** The Church the invitation belongs to — now the redeemer's Active Church. */
  destinationChurchName: string;
  /** "Continue as a member" — leave the split without transferring. */
  onContinueAsMember: () => void;
  /** Called once the transfer commits (or a replay reports it already did). */
  onTransferred: () => void | Promise<void>;
}

/**
 * Spec §8.7's three deliberate layers: choose the move from the split result,
 * review the *actual* affected memberships and future assignments and
 * acknowledge them, then re-authenticate and type the destination Church name
 * to confirm. The former Church has no say at any layer.
 */
export function VolunteerTransferFlow({
  invitationId,
  sourceChurchName,
  destinationChurchName,
  onContinueAsMember,
  onTransferred,
}: VolunteerTransferFlowProps) {
  const [step, setStep] = useState<Step>('split');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (step === 'split') {
    return (
      <SplitResultPanel
        sourceChurchName={sourceChurchName}
        destinationChurchName={destinationChurchName}
        onMove={() => setStep('review')}
        onContinueAsMember={onContinueAsMember}
      />
    );
  }

  if (step === 'review') {
    return (
      <TransferReview
        invitationId={invitationId}
        onBack={() => setStep('split')}
        onContinue={() => setStep('confirm')}
      />
    );
  }

  return (
    <TransferConfirm
      invitationId={invitationId}
      destinationChurchName={destinationChurchName}
      idempotencyKey={idempotencyKey}
      onBack={() => setStep('review')}
      onTransferred={onTransferred}
    />
  );
}

interface SplitResultPanelProps {
  sourceChurchName: string;
  destinationChurchName: string;
  onMove: () => void;
  onContinueAsMember: () => void;
}

function SplitResultPanel({
  sourceChurchName,
  destinationChurchName,
  onMove,
  onContinueAsMember,
}: SplitResultPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Repeat2 className="size-5" />
      </div>
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        You're a member of {destinationChurchName}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        You already serve as a Volunteer at <strong>{sourceChurchName}</strong>,
        and a Volunteer profile can be active at only one Church at a time. Your
        Ministry invitation at <strong>{destinationChurchName}</strong> is still
        waiting for you.
      </p>
      <p className="text-pretty text-muted-foreground text-sm">
        Move your Volunteer profile to <strong>{destinationChurchName}</strong>{' '}
        to accept it. This ends your serving at {sourceChurchName}; they cannot
        stop the move.
      </p>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onMove}>
          Move my Volunteer profile
          <ArrowRight />
        </Button>
        <Button variant="ghost" className="w-full" onClick={onContinueAsMember}>
          Continue to {destinationChurchName} as a member
        </Button>
      </div>
    </div>
  );
}

interface TransferReviewProps {
  invitationId: string;
  onBack: () => void;
  onContinue: () => void;
}

function TransferReview({
  invitationId,
  onBack,
  onContinue,
}: TransferReviewProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const previewQuery = useQuery({
    queryKey: ['redemption', 'transfer-preview', invitationId],
    queryFn: () => redemptionApi.getVolunteerTransferPreview(invitationId),
    retry: false,
  });

  if (previewQuery.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Checking what changes…</p>
    );
  }

  const preview = previewQuery.data;
  if (!preview || preview.kind !== 'reviewable') {
    return (
      <div className="space-y-4">
        <TransferProblemNotice />
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        Review the move
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        Moving to <strong>{preview.destinationChurchName}</strong> ends your
        participation at <strong>{preview.sourceChurchName}</strong>:
      </p>
      <AffectedMembershipsList memberships={preview.endedMemberships} />
      <WithdrawnAssignmentsList assignments={preview.withdrawnAssignments} />
      <div className="flex items-start gap-2 text-sm">
        <Checkbox
          id="transfer-acknowledge"
          checked={acknowledged}
          onCheckedChange={(value) => setAcknowledged(value === true)}
        />
        <Label
          htmlFor="transfer-acknowledge"
          className="font-normal leading-snug"
        >
          I understand these memberships end and these upcoming assignments are
          cancelled.
        </Label>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!acknowledged} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

interface AffectedMembershipsListProps {
  memberships: ReviewablePreview['endedMemberships'];
}

function AffectedMembershipsList({
  memberships,
}: AffectedMembershipsListProps) {
  if (memberships.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No Ministry memberships.</p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">Ministry memberships ending</p>
      <ul className="list-inside list-disc text-muted-foreground text-sm">
        {memberships.map((membership) => (
          <li key={membership.ministryName}>{membership.ministryName}</li>
        ))}
      </ul>
    </div>
  );
}

interface WithdrawnAssignmentsListProps {
  assignments: ReviewablePreview['withdrawnAssignments'];
}

function WithdrawnAssignmentsList({
  assignments,
}: WithdrawnAssignmentsListProps) {
  if (assignments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No upcoming assignments will be cancelled.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">Upcoming assignments cancelled</p>
      <ul className="space-y-1 text-muted-foreground text-sm">
        {assignments.map((assignment) => (
          <li
            key={`${assignment.eventName}-${assignment.timeSlotStart}-${assignment.roleName}`}
          >
            {assignment.eventName} ·{' '}
            {format(new Date(assignment.timeSlotStart), 'PP p')} ·{' '}
            {assignment.roleName}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TransferConfirmProps {
  invitationId: string;
  destinationChurchName: string;
  idempotencyKey: string;
  onBack: () => void;
  onTransferred: () => void | Promise<void>;
}

function TransferConfirm({
  invitationId,
  destinationChurchName,
  idempotencyKey,
  onBack,
  onTransferred,
}: TransferConfirmProps) {
  const [password, setPassword] = useState('');
  const [typedName, setTypedName] = useState('');

  const confirmMutation = useMutation({
    mutationFn: () =>
      redemptionApi.confirmVolunteerTransfer(invitationId, {
        destinationChurchName: typedName,
        password,
        idempotencyKey,
      }),
    onSuccess: async (outcome) => {
      if (
        outcome.kind === 'transferred' ||
        outcome.kind === 'already-transferred'
      ) {
        await onTransferred();
      }
    },
  });

  const nameMatches = typedName.trim() === destinationChurchName;
  const outcome = confirmMutation.data;
  const inlineError = useMemo(() => describeConfirmError(outcome), [outcome]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        confirmMutation.mutate();
      }}
    >
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        Confirm Volunteer Transfer
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        Re-enter your password and type the destination Church name to move.
      </p>

      <div className="space-y-2">
        <Label htmlFor="transfer-password">Password</Label>
        <Input
          id="transfer-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer-church-name">
          Type <strong>{destinationChurchName}</strong> to confirm
        </Label>
        <Input
          id="transfer-church-name"
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
        />
      </div>

      {inlineError ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p className="text-sm">{inlineError}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={confirmMutation.isPending}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={
            !nameMatches || password.length < 8 || confirmMutation.isPending
          }
        >
          {confirmMutation.isPending ? 'Moving…' : 'Confirm Volunteer Transfer'}
        </Button>
      </div>
    </form>
  );
}

function describeConfirmError(
  outcome: ConfirmVolunteerTransfer200 | undefined,
): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'password-mismatch':
      return 'That password did not match. Try again.';
    case 'name-mismatch':
      return 'The Church name did not match exactly.';
    case 'identity-mismatch':
      return 'This invitation belongs to another account.';
    case 'terminal-failure':
      return outcome.reason === 'NO_TRANSFER_NEEDED'
        ? 'There is nothing to transfer.'
        : 'This invitation is no longer available.';
    default:
      return null;
  }
}

function TransferProblemNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <p className="text-sm">
        We couldn't load the transfer details. This invitation may no longer be
        available.
      </p>
    </div>
  );
}
