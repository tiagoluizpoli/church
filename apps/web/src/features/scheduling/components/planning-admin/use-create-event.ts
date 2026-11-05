import { m } from '@church/i18n/messages';
import {
  createEventForm,
  type EventEditorCycleRange,
  toCreateEventBody,
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
  const { fields, pending, onSave } = useEventForm({
    cycleId,
    initialForm: () => createEventForm({ cycle, timeZone }),
    cycle,
    timeZone,
    successMessage: m.event_editor_created_toast(),
    save: async (form) => {
      const body = toCreateEventBody({ form });
      const graph = await adminApi.createPlanningEvent(cycleId, body);
      return graph.event.id;
    },
  });

  return { ...fields, pending, onSave };
}
