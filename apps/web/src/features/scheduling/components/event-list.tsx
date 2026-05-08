import { useTimezone } from '../../../shared/hooks/use-timezone';

interface Event {
  id: string;
  title: string;
  startDate: string; // ISO UTC
  endDate: string; // ISO UTC
}

const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    title: 'Sunday Morning Service',
    startDate: '2026-05-10T09:00:00Z',
    endDate: '2026-05-10T11:00:00Z',
  },
  {
    id: '2',
    title: 'Midweek Prayer Meeting',
    startDate: '2026-05-13T19:00:00Z',
    endDate: '2026-05-13T20:30:00Z',
  },
  {
    id: '3',
    title: 'Youth Night',
    startDate: '2026-05-15T18:00:00Z',
    endDate: '2026-05-15T21:00:00Z',
  },
];

export function EventList() {
  const { format, effectiveTimezone, mode } = useTimezone();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-xl">Upcoming Events</h2>
        <span className="text-muted-foreground text-xs">
          Viewing in {mode === 'church' ? 'Church Time' : 'Local Time'} (
          {effectiveTimezone})
        </span>
      </div>

      <div className="grid gap-4">
        {MOCK_EVENTS.map((event) => (
          <div
            key={event.id}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <h3 className="font-semibold">{event.title}</h3>
            <div className="mt-1 text-muted-foreground text-sm">
              <p>Start: {format(event.startDate)}</p>
              <p>End: {format(event.endDate)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
