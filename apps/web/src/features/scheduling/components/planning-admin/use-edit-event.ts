import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  type EventEditorCycleRange,
  editEventForm,
  toEventSaveRefusal,
  toUpdateEventBody,
} from './event-editor.utils';
import type { EventEditorState } from './event-editor-form';
import { useEventForm } from './use-event-form';
import type { GetCycle200EventsItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export interface UseEditEventInput {
  cycleId: string;
  cycle: EventEditorCycleRange;
  graph: GetCycle200EventsItem;
  timeZone: string;
}

/**
 * Edit state for one Draft Event, seeded from its persisted graph. Save
 * submits the complete desired graph; success refreshes the Cycle's scoped
 * reads and returns to its review, revealing the Event; a refusal keeps every
 * input and, after a state conflict, reloads the authoritative Cycle.
 */
export function useEditEvent({
  cycleId,
  cycle,
  graph,
  timeZone,
}: UseEditEventInput): EventEditorState {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const eventId = graph.event.id;
  const { form, setRefusal, fields } = useEventForm({
    initialForm: () => editEventForm({ graph }),
    cycle,
    timeZone,
  });

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updatePlanningEvent(
        cycleId,
        eventId,
        toUpdateEventBody({ form }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
      toast.success(m.event_editor_updated_toast());
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
    ...fields,
    pending: mutation.isPending,
    onSave: () => {
      if (!mutation.isPending) {
        mutation.mutate();
      }
    },
  };
}
