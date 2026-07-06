import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import { Skeleton } from '@church/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTimezone } from '../../../shared/hooks/use-timezone';
import { QuickCreateEventModal } from './quick-create-event-modal';
import { adminApi } from '@/utils/api-instances';

export function EventList() {
  const { format, effectiveTimezone, mode } = useTimezone();
  const [ministryId, setMinistryId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const ministries = useQuery({
    queryKey: ['listMinistries'],
    queryFn: () => adminApi.listMinistries(),
  });

  useEffect(() => {
    if (
      !ministryId &&
      ministries.data &&
      ministries.data.ministries.length > 0
    ) {
      setMinistryId(ministries.data.ministries[0].id);
    }
  }, [ministries.data, ministryId]);

  const events = useQuery({
    queryKey: ['listEvents', ministryId],
    queryFn: () => adminApi.listEvents({ ministryId: ministryId ?? '' }),
    enabled: !!ministryId,
  });

  return (
    <div className="surface-panel workspace-panel-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-2xl tracking-[-0.02em]">
            Builder events
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">
            Open an event when it needs slot editing, assignee review, or final
            roster adjustments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="radius-control border border-border/80 bg-background/72 px-3 py-1.5 text-muted-foreground text-xs">
            Viewing in {mode === 'church' ? 'Church Time' : 'Local Time'} (
            {effectiveTimezone})
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!ministryId}
            className="min-h-10 px-4"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-3" /> New Event
          </Button>
        </div>
      </div>

      {ministries.data && ministries.data.ministries.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {ministries.data.ministries.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={m.id === ministryId ? 'default' : 'outline'}
              onClick={() => setMinistryId(m.id)}
            >
              {m.name}
            </Button>
          ))}
        </div>
      )}

      {events.isLoading || ministries.isLoading ? (
        <div className="mt-6 grid gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (events.data?.events ?? []).length === 0 ? (
        <div className="surface-subtle workspace-panel mt-6">
          <p className="font-medium text-sm">No builder events yet.</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Create one to get started, or head to Planning if you need to define
            a cycle first.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {(events.data?.events ?? []).map((event) => (
            <Link
              key={event.id}
              to="/scheduling/events/$eventId/builder"
              params={{ eventId: event.id }}
              className="surface-subtle workspace-panel transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{event.title}</h3>
                <Badge
                  className={
                    event.status === 'scheduled'
                      ? 'bg-green-600 text-white'
                      : 'bg-muted text-foreground'
                  }
                >
                  {event.status}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground text-sm">
                <p>Start: {format(event.startDate)}</p>
                <p>End: {format(event.endDate)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {ministryId && (
        <QuickCreateEventModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          target={{ kind: 'ministry', ministryId }}
          onCreated={() => events.refetch()}
        />
      )}
    </div>
  );
}
