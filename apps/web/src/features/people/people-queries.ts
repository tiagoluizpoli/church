import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { BreadcrumbSegmentOverride } from '@/components/app-shell';
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

interface DetailKeyInput extends ChurchKeyInput {
  memberId: string;
}

/** One member's detail beneath the Church root, so an authority change that drops the root drops it too. */
export function peopleDetailQueryKey({ churchId, memberId }: DetailKeyInput) {
  return [...peopleQueryKey({ churchId }), 'detail', memberId] as const;
}

interface UsePersonInput {
  memberId: string;
}

/** The member's scoped detail; a refusal is a result, not a retry. */
export function usePerson({ memberId }: UsePersonInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: peopleDetailQueryKey({ churchId, memberId }),
    queryFn: () => peopleApi.getPerson(memberId),
    retry: false,
  });
}

/** Names the member-id breadcrumb segment; stays hidden until a detail has resolved so a refused page leaks no name. */
export function usePersonBreadcrumb({
  churchId,
}: ChurchKeyInput): BreadcrumbSegmentOverride | null {
  const { memberId } = useParams({ strict: false });
  const person = useQuery({
    queryKey: peopleDetailQueryKey({ churchId, memberId: memberId ?? '' }),
    queryFn: () => peopleApi.getPerson(memberId ?? ''),
    enabled: memberId !== undefined,
    retry: false,
  });
  if (memberId === undefined) return null;
  return {
    segment: memberId,
    label: person.isError ? null : (person.data?.name ?? null),
  };
}
