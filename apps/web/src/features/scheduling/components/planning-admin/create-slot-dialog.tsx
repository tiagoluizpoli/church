import type { CreatingSlotState } from './planning-admin.types';
import { SlotFormFields } from './slot-form-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface CreateSlotDialogProps {
  creatingSlot: CreatingSlotState | null;
  createSlotPending: boolean;
  onChange: (slot: CreatingSlotState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

/** The "Add slot" dialog — label/start/end for a brand-new slot on an
 * existing day/event (FR-009a). */
export function CreateSlotDialog({
  creatingSlot,
  createSlotPending,
  onChange,
  onOpenChange,
  onSubmit,
}: CreateSlotDialogProps) {
  return (
    <Dialog open={creatingSlot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add slot</DialogTitle>
        </DialogHeader>
        {creatingSlot ? (
          <SlotFormFields
            idPrefix="create-slot"
            values={creatingSlot}
            labelPlaceholder="e.g. Worship"
            onChange={(values) => onChange({ ...creatingSlot, ...values })}
          />
        ) : null}
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
            disabled={
              !creatingSlot ||
              creatingSlot.startTimeLocal >= creatingSlot.endTimeLocal ||
              createSlotPending
            }
            onClick={onSubmit}
          >
            {createSlotPending ? 'Adding…' : 'Add slot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
