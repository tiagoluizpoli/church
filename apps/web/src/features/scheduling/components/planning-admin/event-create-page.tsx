import { m } from '@church/i18n/messages';
import type { EventEditorCycleRange } from './event-editor.utils';
import { EventEditorForm } from './event-editor-form';
import {
  BackToCycle,
  CancelToCycle,
  EventEditorPage,
} from './event-editor-page';
import { useCreateEvent } from './use-create-event';
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface EventCreatePageProps {
  cycleId: string;
}

/** Reads its own Cycle by route id, so a direct visit or refresh works. */
export function EventCreatePage({ cycleId }: EventCreatePageProps) {
  return (
    <EventEditorPage
      cycleId={cycleId}
      testId="event-create"
      title={m.event_editor_create_title()}
      description={m.event_editor_create_description()}
    >
      {({ cycle }) =>
        cycle.state === 'draft' ? (
          <EventCreateForm cycleId={cycleId} cycle={cycle} />
        ) : (
          <div
            className="flex flex-col items-start gap-3"
            data-testid="event-create-not-draft"
          >
            <p className="text-muted-foreground text-sm">
              {m.event_editor_not_draft()}
            </p>
            <BackToCycle cycleId={cycleId} />
          </div>
        )
      }
    </EventEditorPage>
  );
}

interface EventCreateFormProps {
  cycleId: string;
  cycle: EventEditorCycleRange;
}

function EventCreateForm({ cycleId, cycle }: EventCreateFormProps) {
  const { churchTimezone } = useTimezone();
  const editor = useCreateEvent({
    cycleId,
    cycle,
    timeZone: churchTimezone,
  });

  return (
    <EventEditorForm
      {...editor}
      actions={<CancelToCycle cycleId={cycleId} />}
    />
  );
}
