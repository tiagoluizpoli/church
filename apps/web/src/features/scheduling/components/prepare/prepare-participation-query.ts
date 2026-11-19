import { parseTimeOfDay } from '@church/time';
import { adminApi } from '@/utils/api-instances';

/** The Schedule page's list filters, as its URL search carries them. */
export interface PrepareListSearch {
  day?: string;
  q?: string;
  timeMode?: 'starts' | 'ends' | 'within';
  timeFrom?: string;
  timeTo?: string;
  needsAttention?: boolean;
}

interface PrepareParticipationQueryInput {
  ministryId: string;
  cycleId: string;
  search: PrepareListSearch;
}

/**
 * The block list's read: the server filters it, and the list and the block editor's
 * prev/next share this cache entry, so stepping follows the rows on screen.
 */
export function prepareParticipationQuery({
  ministryId,
  cycleId,
  search,
}: PrepareParticipationQueryInput) {
  const filters = {
    ministryId,
    day: search.day,
    q: search.q?.trim() || undefined,
    timeMode: search.timeMode ?? 'starts',
    timeFrom: search.timeFrom
      ? parseTimeOfDay({ value: search.timeFrom })
      : undefined,
    timeTo: search.timeTo
      ? parseTimeOfDay({ value: search.timeTo })
      : undefined,
    needsAttention: search.needsAttention ? ('true' as const) : undefined,
  };
  const filtered = Boolean(
    filters.day ||
      filters.q ||
      filters.timeFrom ||
      filters.timeTo ||
      filters.needsAttention,
  );
  return {
    filtered,
    queryKey: filtered
      ? ['prepare-cycle-participation', ministryId, cycleId, filters]
      : ['prepare-cycle-participation', ministryId, cycleId],
    queryFn: () =>
      adminApi.getCycleParticipation(
        cycleId,
        filtered ? filters : { ministryId },
      ),
  };
}
