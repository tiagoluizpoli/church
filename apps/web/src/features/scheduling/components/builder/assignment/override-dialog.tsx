import { useState } from 'react';
import type { AssignmentOverrideKind } from '../../../utils/builder/cycle-builder-fit.utils';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  type AssigneeMembership,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictType: AssignmentOverrideKind;
  volunteerName: string;
  volunteerMembership?: AssigneeMembership;
  slotLabel: string;
  /** The role being filled — named in the `not_qualified` variant's copy. */
  roleLabel?: string;
  isPending: boolean;
  onConfirm: (reason: string) => void;
  /**
   * The team the conflicted slot belongs to, if any. The badge only reads
   * "Team Leader" when the volunteer leads this specific team (FR-013).
   */
  contextTeamId?: string;
}

const MIN_REASON = 10;

export function OverrideDialog({
  open,
  onOpenChange,
  conflictType,
  volunteerName,
  volunteerMembership,
  slotLabel,
  roleLabel,
  isPending,
  onConfirm,
  contextTeamId,
}: OverrideDialogProps) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < MIN_REASON;

  // Qualification is its own override, not a flavour of "unavailable": the
  // server treats it as a separate `NOT_QUALIFIED` warning that only a reason
  // clears, and a leader forcing it is answering a different question.
  const isNotQualified = conflictType === 'not_qualified';
  const name = formatVolunteerName(volunteerName);
  const conflictText = isNotQualified
    ? `${name} isn't qualified for ${roleLabel ?? 'this role'}`
    : conflictType === 'double_booked'
      ? `${name} is double-booked`
      : `${name} is unavailable`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {isNotQualified ? 'Assign anyway?' : 'Override conflict'}
            <AssigneeIdentityBadge
              roleLabel={formatAssigneeRoleLabel({
                membership: volunteerMembership,
                contextTeamId,
              })}
              fullNameOnExpand={volunteerName}
            />
          </DialogTitle>
          <DialogDescription>
            {conflictText} for {slotLabel}. Provide a reason to override.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for override (min 10 characters)…"
          rows={3}
        />
        <p className="text-muted-foreground text-xs">
          {reason.trim().length}/{MIN_REASON}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={tooShort || isPending}
            onClick={() => {
              onOpenChange(false);
              onConfirm(reason.trim());
            }}
          >
            {isPending
              ? 'Saving…'
              : isNotQualified
                ? 'Assign anyway'
                : 'Confirm Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
