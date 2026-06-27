import { Button } from '@church/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { Textarea } from '@church/ui/components/textarea';
import { useState } from 'react';
import type { ConflictStatus } from './assignment-chip';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictType: ConflictStatus;
  volunteerName: string;
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
          <DialogTitle>Override conflict</DialogTitle>
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
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending ? 'Saving…' : 'Confirm Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
