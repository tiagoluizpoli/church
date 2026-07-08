import { useState } from 'react';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import type { ConflictStatus } from './assignment-chip';
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
  type AssigneeSystemRole,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictType: ConflictStatus;
  volunteerName: string;
  volunteerSystemRole?: AssigneeSystemRole;
  slotLabel: string;
  isPending: boolean;
  onConfirm: (reason: string) => void;
}

const MIN_REASON = 10;

export function OverrideDialog({
  open,
  onOpenChange,
  conflictType,
  volunteerName,
  volunteerSystemRole,
  slotLabel,
  isPending,
  onConfirm,
}: OverrideDialogProps) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < MIN_REASON;

  const conflictText =
    conflictType === 'double_booked'
      ? `${formatVolunteerName(volunteerName)} is double-booked`
      : `${formatVolunteerName(volunteerName)} is unavailable`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            Override conflict
            <AssigneeIdentityBadge
              roleLabel={formatAssigneeRoleLabel(volunteerSystemRole)}
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
            {isPending ? 'Saving…' : 'Confirm Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
