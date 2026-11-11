import { m } from '@church/i18n/messages';
import { EventCancelDialog } from './event-cancel-dialog';
import { EventDeleteButton } from './event-delete-button';
import { EventDetailsForm } from './event-details-form';
import type { EventEditorCycleRange } from './event-editor.utils';
import { EventEditorForm } from './event-editor-form';
import {
  BackToCycle,
  CancelToCycle,
  EventEditorPage,
} from './event-editor-page';
import { canCancelEvent } from './planning-admin.utils';
import { useEditEvent } from './use-edit-event';
import type {
  GetCycle200Cycle,
  GetCycle200EventsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface EventEditPageProps {
  cycleId: string;
  eventId: string;
}

/**
 * Edits one Draft Event (or a Sent Event's details), selected by route id from its Cycle's detail, so a
 * direct visit or refresh works; an Event outside this Cycle is not found.
 */
export function EventEditPage({ cycleId, eventId }: EventEditPageProps) {
  return (
    <EventEditorPage
      cycleId={cycleId}
      testId="event-edit"
      title={m.event_editor_edit_title()}
      // The Draft copy invites time and block changes a Sent Event refuses.
      description={({ cycle, events }) =>
        editsSentDetails({ cycle, graph: findGraph({ events, eventId }) })
          ? null
          : m.event_editor_edit_description()
      }
      action={({ cycle, events }) => {
        const graph = findGraph({ events, eventId });
        return graph &&
          canCancelEvent({
            cycleState: cycle.state,
            eventStatus: graph.event.status,
            start: graph.event.start,
          }) ? (
          <EventCancelDialog
            cycleId={cycleId}
            eventId={eventId}
            title={graph.event.title}
          />
        ) : null;
      }}
    >
      {({ cycle, events }) => {
        const graph = findGraph({ events, eventId });
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
        if (editsSentDetails({ cycle, graph })) {
          return <EventDetailsForm cycleId={cycleId} graph={graph} />;
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
      actions={
        <>
          <CancelToCycle cycleId={cycleId} />
          <EventDeleteButton
            cycleId={cycleId}
            eventId={graph.event.id}
            title={graph.event.title}
          />
        </>
      }
    />
  );
}

interface FindGraphInput {
  events: GetCycle200EventsItem[];
  eventId: string;
}

function findGraph({ events, eventId }: FindGraphInput) {
  return events.find(({ event }) => event.id === eventId);
}

interface EditsSentDetailsInput {
  cycle: GetCycle200Cycle;
  graph: GetCycle200EventsItem | undefined;
}

/** A Sent Cycle's scheduled Event edits its details only. */
function editsSentDetails({ cycle, graph }: EditsSentDetailsInput) {
  return cycle.state === 'sent' && graph?.event.status === 'scheduled';
}
