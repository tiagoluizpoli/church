import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

/** Root of every Ministry management read, scoped to the Active Church below it. */
export const MINISTRIES_QUERY_KEY = ['ministries'] as const;

/**
 * Other surfaces that show Ministry names (breadcrumbs, Schedules pickers)
 * and the caller's led Ministries; a create or rename refreshes them too.
 */
const MINISTRY_NAME_READERS = [
  MINISTRIES_QUERY_KEY,
  ['breadcrumb-ministries'],
  ['prepare-ministries'],
  ['caller-capabilities'],
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
    retry: false,
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
    retry: false,
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
    retry: false,
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
