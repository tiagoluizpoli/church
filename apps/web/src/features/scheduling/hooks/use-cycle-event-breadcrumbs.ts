import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from '@tanstack/react-router';
import { adminApi } from '@/utils/api-instances';

const NEW_EVENT_PATH = /^\/cycles\/[^/]+\/events\/new\/?$/;

interface CycleEventBreadcrumbOverride {
  segment: string;
  /** Null hides the segment's crumb. */
  label: string | null;
}

/** The `events` URL level has no page of its own, so its crumb is hidden. */
const HIDDEN_EVENTS_CRUMB: CycleEventBreadcrumbOverride = {
  segment: 'events',
  label: null,
};

/**
 * Home › Cycles › {Cycle} › New Event, or › {Event} on an Event's page, named
 * from the same scoped Cycle detail read the page uses.
 */
export function useCycleEventBreadcrumbs(): CycleEventBreadcrumbOverride[] {
  const { pathname } = useLocation();
  const { cycleId, eventId } = useParams({ strict: false });
  const cycleDetailsQuery = useQuery({
    queryKey: ['cycle-details', cycleId],
    queryFn: () => adminApi.getCycle(cycleId ?? ''),
    enabled: cycleId !== undefined && eventId !== undefined,
    retry: false,
  });

  if (NEW_EVENT_PATH.test(pathname)) {
    return [
      HIDDEN_EVENTS_CRUMB,
      { segment: 'new', label: m.breadcrumb_new_event() },
    ];
  }
  if (cycleId === undefined || eventId === undefined) {
    return [];
  }
  const graph = cycleDetailsQuery.data?.events.find(
    ({ event }) => event.id === eventId,
  );
  return graph
    ? [HIDDEN_EVENTS_CRUMB, { segment: eventId, label: graph.event.title }]
    : [HIDDEN_EVENTS_CRUMB];
}
