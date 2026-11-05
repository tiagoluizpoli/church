import { m } from '@church/i18n/messages';
import type { EventEditorCycleRange } from './event-editor.utils';
import { EventEditorForm } from './event-editor-form';
import {
  BackToCycle,
  CancelToCycle,
  EventEditorPage,
} from './event-editor-page';
import { useEditEvent } from './use-edit-event';
import type { GetCycle200EventsItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface EventEditPageProps {
  cycleId: string;
  eventId: string;
}

/**
 * Edits one Draft Event, selected by route id from its Cycle's detail, so a
 * direct visit or refresh works; an Event outside this Cycle is not found.
 */
export function EventEditPage({ cycleId, eventId }: EventEditPageProps) {
  return (
    <EventEditorPage
      cycleId={cycleId}
      testId="event-edit"
      title={m.event_editor_edit_title()}
      description={m.event_editor_edit_description()}
    >
      {({ cycle, events }) => {
        const graph = events.find(({ event }) => event.id === eventId);
        if (!graph) {
          return (
            <div
              className="flex flex-col items-start gap-3"
              data-testid="event-edit-event-not-found"
            >
              <p className="text-muted-foreground text-sm">
                {m.event_editor_event_not_found()}
              </p>
              <BackToCycle cycleId={cycleId} />
            </div>
          );
        }
        if (cycle.state !== 'draft' || graph.event.status !== 'draft') {
          return (
            <div
              className="flex flex-col items-start gap-3"
              data-testid="event-edit-not-draft"
            >
              <p className="text-muted-foreground text-sm">
                {m.event_editor_edit_not_draft()}
              </p>
              <BackToCycle cycleId={cycleId} />
            </div>
          );
        }
        return <EventEditForm cycleId={cycleId} cycle={cycle} graph={graph} />;
      }}
    </EventEditorPage>
  );
}

interface EventEditFormProps {
  cycleId: string;
  cycle: EventEditorCycleRange;
  graph: GetCycle200EventsItem;
}

function EventEditForm({ cycleId, cycle, graph }: EventEditFormProps) {
  const { churchTimezone } = useTimezone();
  const editor = useEditEvent({
    cycleId,
    cycle,
    graph,
    timeZone: churchTimezone,
  });

  return (
    <EventEditorForm
      {...editor}
      actions={<CancelToCycle cycleId={cycleId} />}
    />
  );
}
