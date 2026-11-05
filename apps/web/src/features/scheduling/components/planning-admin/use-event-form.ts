import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
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
  toEventSaveRefusal,
} from './event-editor.utils';

export interface UseEventFormInput {
  cycleId: string;
  save: (form: EventEditorFormState) => Promise<string>;
  successMessage: string;
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
  pending: boolean;
  onSave: () => void;
  fields: EventEditorFields;
}

/**
 * Draft Event state shared by the new and edit pages. Any edit clears the
 * last save refusal; a failed save never discards what was entered. Shared
 * save handling refreshes the Cycle, reveals the saved Event and reconciles
 * state conflicts; callers retain their request shape and success copy.
 */
export function useEventForm({
  cycleId,
  save,
  successMessage,
  initialForm,
  cycle,
  timeZone,
}: UseEventFormInput): UseEventFormResult {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<EventEditorFormState>(initialForm);
  const [refusal, setRefusal] = useState<EventSaveRefusal | null>(null);
  const errors = eventEditorErrors({ form, cycle, timeZone });

  const mutation = useMutation({
    mutationFn: () => save(form),
    onSuccess: async (eventId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
      toast.success(successMessage);
      await navigate({
        to: '/cycles/$cycleId',
        params: { cycleId },
        search: { eventId },
      });
    },
    onError: async (error) => {
      const refusal = toEventSaveRefusal({ error });
      setRefusal(refusal);
      if (refusal.stateConflict) {
        await queryClient.invalidateQueries({
          queryKey: ['cycle-details', cycleId],
        });
      }
    },
  });

  return {
    form,
    pending: mutation.isPending,
    onSave: () => {
      if (!mutation.isPending) mutation.mutate();
    },
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
