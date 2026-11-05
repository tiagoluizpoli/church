import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { EventEditorCycleRange } from './event-editor.utils';
import { EventEditorForm } from './event-editor-form';
import { isNotFoundError } from './planning-admin.utils';
import { RetryAlert } from './retry-alert';
import { useCreateEvent } from './use-create-event';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { adminApi } from '@/utils/api-instances';

export interface EventCreatePageProps {
  cycleId: string;
}

interface BackToCycleProps {
  cycleId: string;
}

function BackToCycle({ cycleId }: BackToCycleProps) {
  return (
    <Link
      to="/cycles/$cycleId"
      params={{ cycleId }}
      className={buttonVariants()}
    >
      {m.event_editor_back_to_cycle()}
    </Link>
  );
}

/** Reads its own Cycle by route id, so a direct visit or refresh works. */
export function EventCreatePage({ cycleId }: EventCreatePageProps) {
  const cycleQuery = useQuery({
    queryKey: ['cycle-details', cycleId],
    queryFn: () => adminApi.getCycle(cycleId),
    retry: false,
  });
  const cycle = cycleQuery.data?.cycle;

  return (
    <Card className="surface-panel" data-testid="event-create-page">
      <CardHeader>
        <CardTitle>{m.event_editor_create_title()}</CardTitle>
        <CardDescription>{m.event_editor_create_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        {cycle ? (
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
        ) : cycleQuery.isError ? (
          isNotFoundError({ error: cycleQuery.error }) ? (
            <div
              className="flex flex-col items-start gap-3"
              data-testid="event-create-cycle-not-found"
            >
              <p className="text-muted-foreground text-sm">
                {m.cycle_review_not_found()}
              </p>
              <Link to="/cycles" className={buttonVariants()}>
                {m.nav_cycles()}
              </Link>
            </div>
          ) : (
            <RetryAlert
              message={m.cycle_review_error()}
              testId="event-create-load-error"
              onRetry={() => cycleQuery.refetch()}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm" role="status">
            {m.cycle_review_loading()}
          </p>
        )}
      </CardContent>
    </Card>
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
      actions={
        <Link
          to="/cycles/$cycleId"
          params={{ cycleId }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {m.event_editor_cancel()}
        </Link>
      }
    />
  );
}
