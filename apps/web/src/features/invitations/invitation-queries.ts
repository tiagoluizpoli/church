import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ListInvitationsParams } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { invitationsApi } from '@/utils/api-instances';

/** Root of every Invitations read, scoped to the Active Church below it. */
export const INVITATIONS_QUERY_KEY = ['invitations'] as const;

export type InvitationFilters = Omit<ListInvitationsParams, 'cursor' | 'limit'>;

interface ListKeyInput {
  churchId: string | undefined;
  filters?: InvitationFilters;
}

/** Church, then filters: a switch of either reads another key and restarts at the first page. */
export function invitationListQueryKey({ churchId, filters }: ListKeyInput) {
  return [...INVITATIONS_QUERY_KEY, churchId, 'list', filters ?? {}] as const;
}

interface UseInvitationListInput {
  filters: InvitationFilters;
}

/** Newest-first pages of invitations under the filters; Pending is the server default. */
export function useInvitationList({ filters }: UseInvitationListInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useInfiniteQuery({
    queryKey: invitationListQueryKey({ churchId, filters }),
    // Keeps the pickers on screen while a new filter set loads.
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      invitationsApi.listInvitations(
        pageParam ? { ...filters, cursor: pageParam } : filters,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
}
