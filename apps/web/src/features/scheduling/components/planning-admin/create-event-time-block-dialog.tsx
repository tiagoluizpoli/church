import { EventTimeBlockFormFields } from './event-time-block-form-fields';
import type { CreatingEventTimeBlockState } from './planning-admin.types';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { isInvalidInstantRange } from '@/shared/utils/span-description';

export interface CreateEventTimeBlockDialogProps {
  creatingEventTimeBlock: CreatingEventTimeBlockState | null;
  createEventTimeBlockPending: boolean;
  timeZone: string;
  onChange: (eventTimeBlock: CreatingEventTimeBlockState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

/** The "Add time block" dialog — label/start/end for a brand-new time block on an
 * existing day/event (FR-009a). */
export function CreateEventTimeBlockDialog({
  creatingEventTimeBlock,
  createEventTimeBlockPending,
  timeZone,
  onChange,
  onOpenChange,
  onSubmit,
}: CreateEventTimeBlockDialogProps) {
  return (
    <ResponsiveFormSurface
      open={creatingEventTimeBlock !== null}
      onOpenChange={onOpenChange}
      title="Add time block"
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
              !creatingEventTimeBlock ||
              isInvalidInstantRange({
                start: creatingEventTimeBlock.start,
                end: creatingEventTimeBlock.end,
              }) ||
              createEventTimeBlockPending
            }
            onClick={onSubmit}
          >
            {createEventTimeBlockPending ? 'Adding…' : 'Add time block'}
          </Button>
        </>
      }
    >
      {creatingEventTimeBlock ? (
        <EventTimeBlockFormFields
          idPrefix="create-event-time-block"
          values={creatingEventTimeBlock}
          timeZone={timeZone}
          labelPlaceholder="e.g. Worship"
          onChange={(values) =>
            onChange({ ...creatingEventTimeBlock, ...values })
          }
        />
      ) : null}
    </ResponsiveFormSurface>
  );
}
