import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { invitationsApi } from '@/utils/api-instances';

/** Root of every Invitations read, scoped to the Active Church below it. */
export const INVITATIONS_QUERY_KEY = ['invitations'] as const;

interface ChurchScopeInput {
  churchId: string | undefined;
}

export function invitationListQueryKey({ churchId }: ChurchScopeInput) {
  return [...INVITATIONS_QUERY_KEY, churchId, 'list'] as const;
}

/** Newest-first pages of pending invitations; a Church switch reads another key. */
export function useInvitationList() {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useInfiniteQuery({
    queryKey: invitationListQueryKey({ churchId }),
    queryFn: ({ pageParam }) =>
      invitationsApi.listInvitations(pageParam ? { cursor: pageParam } : {}),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
}
