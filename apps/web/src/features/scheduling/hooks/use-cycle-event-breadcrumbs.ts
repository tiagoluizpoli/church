import { m } from '@church/i18n/messages';
import { useLocation } from '@tanstack/react-router';

const NEW_EVENT_PATH = /^\/cycles\/[^/]+\/events\/new\/?$/;

interface CycleEventBreadcrumbOverride {
  segment: string;
  /** Null hides the segment's crumb. */
  label: string | null;
}

/**
 * Home › Cycles › {Cycle} › New Event: the `events` URL level has no page of
 * its own, so its crumb is hidden, and `new` names what is being created.
 */
export function useCycleEventBreadcrumbs(): CycleEventBreadcrumbOverride[] {
  const { pathname } = useLocation();
  if (!NEW_EVENT_PATH.test(pathname)) {
    return [];
  }
  return [
    { segment: 'events', label: null },
    { segment: 'new', label: m.breadcrumb_new_event() },
  ];
}
