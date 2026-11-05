import { m } from '@church/i18n/messages';
import {
  type EventEditorCycleRange,
  editEventForm,
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
  const eventId = graph.event.id;
  const { fields, pending, onSave } = useEventForm({
    cycleId,
    initialForm: () => editEventForm({ graph }),
    cycle,
    timeZone,
    successMessage: m.event_editor_updated_toast(),
    save: async (form) => {
      const body = toUpdateEventBody({ form });
      await adminApi.updatePlanningEvent(cycleId, eventId, body);
      return eventId;
    },
  });

  return { ...fields, pending, onSave };
}
