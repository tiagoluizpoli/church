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
  isPending: boolean;
  onConfirm: () => void;
}

export function OverrideDialog({
  open,
  onOpenChange,
  volunteerName,
  volunteerMembership,
  eventTimeBlockLabel,
  isPending,
  onConfirm,
}: OverrideDialogProps) {
  const name = formatVolunteerName(volunteerName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            Override conflict
            <AssigneeRoleBadge
              membership={volunteerMembership}
              fullNameOnExpand={volunteerName}
            />
          </DialogTitle>
          <DialogDescription>
            {name} is unavailable for {eventTimeBlockLabel}.
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
            {isPending ? 'Saving…' : 'Confirm Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
