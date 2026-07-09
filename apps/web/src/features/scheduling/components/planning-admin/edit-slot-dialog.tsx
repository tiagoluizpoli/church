import type { EditingSlotState } from './planning-admin.types';
import { SlotFormFields } from './slot-form-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface EditSlotDialogProps {
  editingSlot: EditingSlotState | null;
  updateSlotPending: boolean;
  onChange: (slot: EditingSlotState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

/** The "Edit slot" dialog — label/start/end for an existing slot within a
 * day/event (FR-009). */
export function EditSlotDialog({
  editingSlot,
  updateSlotPending,
  onChange,
  onOpenChange,
  onSubmit,
}: EditSlotDialogProps) {
  return (
    <Dialog open={editingSlot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit slot</DialogTitle>
        </DialogHeader>
        {editingSlot ? (
          <SlotFormFields
            idPrefix="edit-slot"
            values={editingSlot}
            onChange={(values) => onChange({ ...editingSlot, ...values })}
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
              !editingSlot ||
              editingSlot.startTimeLocal >= editingSlot.endTimeLocal ||
              updateSlotPending
            }
            onClick={onSubmit}
          >
            {updateSlotPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
