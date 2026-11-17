import { m } from '@church/i18n/messages';
import { formatInstant, parseInstant } from '@church/time';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { randomId } from '@/shared/utils/id';
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
  const [idempotencyKey] = useState(() => randomId());

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
        {m.volunteer_transfer_split_title({
          churchName: destinationChurchName,
        })}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.volunteer_transfer_split_current({
          sourceChurchName,
          destinationChurchName,
        })}
      </p>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.volunteer_transfer_split_move({
          sourceChurchName,
          destinationChurchName,
        })}
      </p>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onMove}>
          {m.volunteer_transfer_move_action()}
          <ArrowRight />
        </Button>
        <Button variant="ghost" className="w-full" onClick={onContinueAsMember}>
          {m.volunteer_transfer_continue_as_member({
            churchName: destinationChurchName,
          })}
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
      <p className="text-muted-foreground text-sm">
        {m.volunteer_transfer_checking()}
      </p>
    );
  }

  const preview = previewQuery.data;
  if (!preview || preview.kind !== 'reviewable') {
    return (
      <div className="space-y-4">
        <TransferProblemNotice />
        <Button variant="outline" className="w-full" onClick={onBack}>
          {m.volunteer_transfer_back()}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.volunteer_transfer_review_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.volunteer_transfer_review_intro({
          sourceChurchName: preview.sourceChurchName,
          destinationChurchName: preview.destinationChurchName,
        })}
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
          {m.volunteer_transfer_acknowledge()}
        </Label>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onBack}>
          {m.volunteer_transfer_back()}
        </Button>
        <Button disabled={!acknowledged} onClick={onContinue}>
          {m.volunteer_transfer_continue()}
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
      <p className="text-muted-foreground text-sm">
        {m.volunteer_transfer_no_memberships()}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">
        {m.volunteer_transfer_memberships_ending()}
      </p>
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

// This preview DTO carries no Church Timezone (the former Church isn't
// resolvable as an "active" one from this pre-auth flow), so times display in
// UTC rather than guessing the browser's zone.
function WithdrawnAssignmentsList({
  assignments,
}: WithdrawnAssignmentsListProps) {
  if (assignments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.volunteer_transfer_no_assignments()}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">
        {m.volunteer_transfer_assignments_cancelled()}
      </p>
      <ul className="space-y-1 text-muted-foreground text-sm">
        {assignments.map((assignment) => (
          <li
            key={`${assignment.eventName}-${assignment.eventTimeBlockStart}-${assignment.roleName}`}
          >
            {assignment.eventName} ·{' '}
            {formatInstant({
              instant: parseInstant({ value: assignment.eventTimeBlockStart }),
              timeZone: 'UTC',
            })}{' '}
            · {assignment.roleName}
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
  const inlineError = useMemo(
    () => describeConfirmError({ outcome }),
    [outcome],
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        confirmMutation.mutate();
      }}
    >
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.volunteer_transfer_confirm_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.volunteer_transfer_confirm_intro()}
      </p>

      <div className="space-y-2">
        <Label htmlFor="transfer-password">
          {m.volunteer_transfer_password_label()}
        </Label>
        <Input
          id="transfer-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer-church-name">
          {m.volunteer_transfer_type_name({
            churchName: destinationChurchName,
          })}
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
          {m.volunteer_transfer_back()}
        </Button>
        <Button
          type="submit"
          disabled={
            !nameMatches || password.length < 8 || confirmMutation.isPending
          }
        >
          {confirmMutation.isPending
            ? m.volunteer_transfer_moving()
            : m.volunteer_transfer_confirm_title()}
        </Button>
      </div>
    </form>
  );
}

interface DescribeConfirmErrorInput {
  outcome: ConfirmVolunteerTransfer200 | undefined;
}

function describeConfirmError({
  outcome,
}: DescribeConfirmErrorInput): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'password-mismatch':
      return m.volunteer_transfer_password_mismatch();
    case 'name-mismatch':
      return m.volunteer_transfer_name_mismatch();
    case 'identity-mismatch':
      return m.volunteer_transfer_identity_mismatch();
    case 'terminal-failure':
      return outcome.reason === 'NO_TRANSFER_NEEDED'
        ? m.volunteer_transfer_nothing()
        : m.volunteer_transfer_unavailable();
    default:
      return null;
  }
}

function TransferProblemNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <p className="text-sm">{m.volunteer_transfer_load_failed()}</p>
    </div>
  );
}
