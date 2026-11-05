import { useState } from 'react';
import {
  addEventBlock,
  canSaveEvent,
  changeEventBlock,
  changeEventField,
  type EventBlockChange,
  type EventEditorCycleRange,
  type EventEditorErrors,
  type EventEditorFormState,
  type EventFieldChange,
  type EventSaveRefusal,
  eventEditorErrors,
} from './event-editor.utils';

export interface UseEventFormInput {
  initialForm: () => EventEditorFormState;
  cycle: EventEditorCycleRange;
  timeZone: string;
}

interface RemoveEventBlockInput {
  blockKey: string;
}

export interface EventEditorFields {
  form: EventEditorFormState;
  errors: EventEditorErrors;
  refusal: EventSaveRefusal | null;
  canSave: boolean;
  timeZone: string;
  onEventChange: (change: EventFieldChange) => void;
  onBlockChange: (change: EventBlockChange) => void;
  onRemoveBlock: (input: RemoveEventBlockInput) => void;
  onAddBlock: () => void;
}

export interface UseEventFormResult {
  form: EventEditorFormState;
  setRefusal: (refusal: EventSaveRefusal | null) => void;
  fields: EventEditorFields;
}

/**
 * Draft Event state shared by the new and edit pages. Any edit clears the
 * last save refusal; a failed save never discards what was entered.
 */
export function useEventForm({
  initialForm,
  cycle,
  timeZone,
}: UseEventFormInput): UseEventFormResult {
  const [form, setForm] = useState<EventEditorFormState>(initialForm);
  const [refusal, setRefusal] = useState<EventSaveRefusal | null>(null);
  const errors = eventEditorErrors({ form, cycle, timeZone });

  return {
    form,
    setRefusal,
    fields: {
      form,
      errors,
      refusal,
      canSave: canSaveEvent({ form, errors }),
      timeZone,
      onEventChange: (change) => {
        setRefusal(null);
        setForm((current) => changeEventField({ form: current, change }));
      },
      onBlockChange: (change) => {
        setRefusal(null);
        setForm((current) => changeEventBlock({ form: current, change }));
      },
      onRemoveBlock: ({ blockKey }) => {
        setRefusal(null);
        setForm((current) => ({
          ...current,
          blocks: current.blocks.filter((block) => block.key !== blockKey),
        }));
      },
      onAddBlock: () => {
        setRefusal(null);
        setForm((current) => addEventBlock({ form: current }));
      },
    },
  };
}
