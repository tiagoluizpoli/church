import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  createEventForm,
  type EventEditorCycleRange,
  toCreateEventBody,
  toEventSaveRefusal,
} from './event-editor.utils';
import type { EventEditorState } from './event-editor-form';
import { useEventForm } from './use-event-form';
import { adminApi } from '@/utils/api-instances';

export interface UseCreateEventInput {
  cycleId: string;
  cycle: EventEditorCycleRange;
  timeZone: string;
}

/**
 * New Event state on one Draft Cycle. Success refreshes that Cycle's scoped
 * reads and returns to its review, revealing the saved Event; a refusal keeps
 * every input and, after a state conflict, reloads the authoritative Cycle.
 */
export function useCreateEvent({
  cycleId,
  cycle,
  timeZone,
}: UseCreateEventInput): EventEditorState {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { form, setRefusal, fields } = useEventForm({
    initialForm: () => createEventForm({ cycle, timeZone }),
    cycle,
    timeZone,
  });

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createPlanningEvent(cycleId, toCreateEventBody({ form })),
    onSuccess: async (graph) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
      toast.success(m.event_editor_created_toast());
      await navigate({
        to: '/cycles/$cycleId',
        params: { cycleId },
        search: { eventId: graph.event.id },
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
    ...fields,
    pending: mutation.isPending,
    onSave: () => {
      if (!mutation.isPending) {
        mutation.mutate();
      }
    },
  };
}
