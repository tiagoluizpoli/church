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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-xl">Events</h2>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            Viewing in {mode === 'church' ? 'Church Time' : 'Local Time'} (
            {effectiveTimezone})
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!ministryId}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-3" /> New Event
          </Button>
        </div>
      </div>

      {ministries.data && ministries.data.ministries.length > 1 && (
        <div className="flex flex-wrap gap-2">
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
        <div className="grid gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (events.data?.events ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No events yet. Create one to get started.
        </p>
      ) : (
        <div className="grid gap-4">
          {(events.data?.events ?? []).map((event) => (
            <Link
              key={event.id}
              to="/scheduling/events/$eventId/builder"
              params={{ eventId: event.id }}
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{event.title}</h3>
                <Badge
                  className={
                    event.status === 'published'
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
          ministryId={ministryId}
          onCreated={() => events.refetch()}
        />
      )}
    </div>
  );
}
