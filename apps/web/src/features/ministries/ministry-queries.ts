import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type { ListMinistryDirectoryParams } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CALLER_CAPABILITIES_QUERY_KEY } from '@/shared/hooks/use-caller-capabilities';
import { adminApi } from '@/utils/api-instances';

/** Root of every Ministry management read, scoped to the Active Church below it. */
export const MINISTRIES_QUERY_KEY = ['ministries'] as const;

/**
 * Other surfaces that show Ministry names (breadcrumbs, Schedules pickers)
 * and the caller's led Ministries; a create or rename refreshes them too.
 */
const MINISTRY_NAME_READERS = [
  MINISTRIES_QUERY_KEY,
  CALLER_CAPABILITIES_QUERY_KEY,
] as const;

interface ChurchScopeInput {
  churchId: string | undefined;
}

interface MinistryScopeInput extends ChurchScopeInput {
  ministryId: string;
}

export function ministryListQueryKey({ churchId }: ChurchScopeInput) {
  return [...MINISTRIES_QUERY_KEY, churchId, 'list'] as const;
}

export function ministryDetailQueryKey({
  churchId,
  ministryId,
}: MinistryScopeInput) {
  return [...MINISTRIES_QUERY_KEY, churchId, 'detail', ministryId] as const;
}

interface UseMinistryListInput {
  enabled: boolean;
}

export function useMinistryList({ enabled }: UseMinistryListInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: ministryListQueryKey({ churchId }),
    queryFn: () => adminApi.listMinistries(),
    enabled,
  });
}

export type MinistryDirectoryFilters = Omit<
  ListMinistryDirectoryParams,
  'cursor' | 'limit'
>;

interface MinistryDirectoryKeyInput extends ChurchScopeInput {
  filters?: MinistryDirectoryFilters;
}

/** Church, then filters: a switch of either reads another key and restarts at the first page. */
export function ministryDirectoryQueryKey({
  churchId,
  filters,
}: MinistryDirectoryKeyInput) {
  return [
    ...MINISTRIES_QUERY_KEY,
    churchId,
    'directory',
    filters ?? {},
  ] as const;
}

interface UseMinistryDirectoryInput {
  filters: MinistryDirectoryFilters;
}

/** The Ministries page: server-filtered pages, alphabetical, with whole-scope counts. */
export function useMinistryDirectory({ filters }: UseMinistryDirectoryInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useInfiniteQuery({
    queryKey: ministryDirectoryQueryKey({ churchId, filters }),
    // Keeps the chips and rows on screen while a new filter set loads.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      adminApi.listMinistryDirectory(
        pageParam ? { ...filters, cursor: pageParam } : filters,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

interface UseMinistryInput {
  ministryId: string;
}

/** The workspace's resolved Ministry; every tab reads this one cache entry. */
export function useMinistry({ ministryId }: UseMinistryInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: ministryDetailQueryKey({ churchId, ministryId }),
    queryFn: () => adminApi.getMinistry(ministryId),
  });
}

interface InvalidateMinistryReadsInput {
  queryClient: QueryClient;
}

export async function invalidateMinistryReads({
  queryClient,
}: InvalidateMinistryReadsInput): Promise<void> {
  await Promise.all(
    MINISTRY_NAME_READERS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function sectorListQueryKey({
  churchId,
  ministryId,
}: MinistryScopeInput) {
  return [...MINISTRIES_QUERY_KEY, churchId, 'sectors', ministryId] as const;
}

/** The Ministry's active Sectors, alphabetical. */
export function useSectorList({ ministryId }: UseMinistryInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: sectorListQueryKey({ churchId, ministryId }),
    queryFn: () => adminApi.listSectors(ministryId),
  });
}

/** Surfaces that offer Sectors as new-use choices. */
const SECTOR_CHOICE_READERS = [
  MINISTRIES_QUERY_KEY,
  ['prepare-role-catalog'],
  ['cycle-builder'],
] as const;

export async function invalidateSectorReads({
  queryClient,
}: InvalidateMinistryReadsInput): Promise<void> {
  await Promise.all(
    SECTOR_CHOICE_READERS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function eventGroupsQueryKey({
  churchId,
  ministryId,
}: MinistryScopeInput) {
  return [
    ...MINISTRIES_QUERY_KEY,
    churchId,
    'event-groups',
    ministryId,
  ] as const;
}

/** The Ministry's Event groups and every EventTemplate they can hold. */
export function useEventGroups({ ministryId }: UseMinistryInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: eventGroupsQueryKey({ churchId, ministryId }),
    queryFn: () => adminApi.getEventGroups(ministryId),
  });
}
