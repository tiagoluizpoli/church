import { EventTimeBlockFormFields } from './event-time-block-form-fields';
import type { EditingEventTimeBlockState } from './planning-admin.types';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { isInvalidInstantRange } from '@/shared/utils/span-description';

export interface EditEventTimeBlockDialogProps {
  editingEventTimeBlock: EditingEventTimeBlockState | null;
  updateEventTimeBlockPending: boolean;
  timeZone: string;
  onChange: (slot: EditingEventTimeBlockState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

/** The "Edit slot" dialog — label/start/end for an existing slot within a
 * day/event (FR-009). */
export function EditEventTimeBlockDialog({
  editingEventTimeBlock,
  updateEventTimeBlockPending,
  timeZone,
  onChange,
  onOpenChange,
  onSubmit,
}: EditEventTimeBlockDialogProps) {
  return (
    <ResponsiveFormSurface
      open={editingEventTimeBlock !== null}
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
              !editingEventTimeBlock ||
              isInvalidInstantRange({
                start: editingEventTimeBlock.start,
                end: editingEventTimeBlock.end,
              }) ||
              updateEventTimeBlockPending
            }
            onClick={onSubmit}
          >
            {updateEventTimeBlockPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {editingEventTimeBlock ? (
        <EventTimeBlockFormFields
          idPrefix="edit-event-time-block"
          values={editingEventTimeBlock}
          timeZone={timeZone}
          onChange={(values) =>
            onChange({ ...editingEventTimeBlock, ...values })
          }
        />
      ) : null}
    </ResponsiveFormSurface>
  );
}
