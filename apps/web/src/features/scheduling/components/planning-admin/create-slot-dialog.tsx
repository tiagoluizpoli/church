import type { CreatingSlotState } from './planning-admin.types';
import { SlotFormFields } from './slot-form-fields';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';

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
    <ResponsiveFormSurface
      open={creatingSlot !== null}
      onOpenChange={onOpenChange}
      title="Add slot"
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
              !creatingSlot ||
              creatingSlot.startTimeLocal >= creatingSlot.endTimeLocal ||
              createSlotPending
            }
            onClick={onSubmit}
          >
            {createSlotPending ? 'Adding…' : 'Add slot'}
          </Button>
        </>
      }
    >
      {creatingSlot ? (
        <SlotFormFields
          idPrefix="create-slot"
          values={creatingSlot}
          labelPlaceholder="e.g. Worship"
          onChange={(values) => onChange({ ...creatingSlot, ...values })}
        />
      ) : null}
    </ResponsiveFormSurface>
  );
}
