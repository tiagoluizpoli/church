import type { AssignmentOverrideKind } from '../../../utils/builder/cycle-builder-fit.utils';
import { AssigneeRoleBadge } from './assignee-role-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictType: AssignmentOverrideKind;
  volunteerName: string;
  volunteerMembership?: AssigneeMembership;
  eventTimeBlockLabel: string;
  /** The role being filled — named in the `not_qualified` variant's copy. */
  roleLabel?: string;
  isPending: boolean;
  onConfirm: () => void;
}

export function OverrideDialog({
  open,
  onOpenChange,
  conflictType,
  volunteerName,
  volunteerMembership,
  eventTimeBlockLabel,
  roleLabel,
  isPending,
  onConfirm,
}: OverrideDialogProps) {
  // Qualification is its own override, not a flavour of "unavailable": the
  // server treats it as a separate `NOT_QUALIFIED` warning, and a leader
  // forcing it is answering a different question.
  const isNotQualified = conflictType === 'not_qualified';
  const name = formatVolunteerName(volunteerName);
  const conflictText = isNotQualified
    ? `${name} isn't qualified for ${roleLabel ?? 'this role'}`
    : `${name} is unavailable`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {isNotQualified ? 'Assign anyway?' : 'Override conflict'}
            <AssigneeRoleBadge
              membership={volunteerMembership}
              fullNameOnExpand={volunteerName}
            />
          </DialogTitle>
          <DialogDescription>
            {conflictText} for {eventTimeBlockLabel}.
          </DialogDescription>
        </DialogHeader>

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
            disabled={isPending}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
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
