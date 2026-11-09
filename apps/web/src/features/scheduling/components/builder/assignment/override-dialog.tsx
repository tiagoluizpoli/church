import { m } from '@church/i18n/messages';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {m.builder_unavailable_confirm_title()}
            <AssigneeRoleBadge
              membership={volunteerMembership}
              fullNameOnExpand={volunteerName}
            />
          </DialogTitle>
          <DialogDescription>
            {m.builder_unavailable_confirm_description({
              name: volunteerName,
              shift: eventTimeBlockLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {m.builder_unavailable_confirm_cancel()}
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
              ? m.builder_unavailable_confirm_saving()
              : m.builder_unavailable_confirm_action()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
