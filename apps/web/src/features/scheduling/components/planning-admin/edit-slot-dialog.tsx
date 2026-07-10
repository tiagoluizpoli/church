import type { EditingSlotState } from './planning-admin.types';
import { SlotFormFields } from './slot-form-fields';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';

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
    <ResponsiveFormSurface
      open={editingSlot !== null}
      onOpenChange={onOpenChange}
      title="Edit slot"
      footer={
        <>
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
        </>
      }
    >
      {editingSlot ? (
        <SlotFormFields
          idPrefix="edit-slot"
          values={editingSlot}
          onChange={(values) => onChange({ ...editingSlot, ...values })}
        />
      ) : null}
    </ResponsiveFormSurface>
  );
}
