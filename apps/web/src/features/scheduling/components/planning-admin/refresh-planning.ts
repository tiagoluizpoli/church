import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';

interface RefreshPlanningInput {
  queryClient: QueryClient;
  cycleId: string;
  /** Further reads the change reaches beyond planning and Schedules. */
  readers?: readonly QueryKey[];
}

/** After a sent Event or block changes: its Cycle, the builder and every Ministry's Schedule reread it. */
export function refreshPlanning({
  queryClient,
  cycleId,
  readers = [],
}: RefreshPlanningInput) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
    ...[['cycles'], CYCLE_BUILDER_QUERY_KEY, ...readers].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
    queryClient.invalidateQueries({
      predicate: ({ queryKey: [key] }) =>
        typeof key === 'string' && key.startsWith('prepare-'),
    }),
  ]);
}
