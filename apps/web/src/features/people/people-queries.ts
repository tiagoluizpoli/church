import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ListPeopleParams } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { peopleApi } from '@/utils/api-instances';

/** Root of every People read; invalidate `peopleQueryKey` to refresh the Active Church's directory and details. */
export const PEOPLE_QUERY_KEY = ['people'] as const;

export type PeopleFilters = Omit<ListPeopleParams, 'cursor' | 'limit'>;

interface ChurchKeyInput {
  churchId: string | undefined;
}

/** All People reads of one Church: lists now, details and mutations later. */
export function peopleQueryKey({ churchId }: ChurchKeyInput) {
  return [...PEOPLE_QUERY_KEY, churchId] as const;
}

interface ListKeyInput extends ChurchKeyInput {
  filters?: PeopleFilters;
}

/** Church, then filters: a switch of either reads another key and restarts at the first page. */
export function peopleListQueryKey({ churchId, filters }: ListKeyInput) {
  return [...peopleQueryKey({ churchId }), 'list', filters ?? {}] as const;
}

interface UsePeopleListInput {
  filters: PeopleFilters;
}

/** Name-ordered pages of the members the caller may see. */
export function usePeopleList({ filters }: UsePeopleListInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useInfiniteQuery({
    queryKey: peopleListQueryKey({ churchId, filters }),
    // Keeps the pickers on screen while a new filter set loads.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      peopleApi.listPeople(
        pageParam ? { ...filters, cursor: pageParam } : filters,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
}
