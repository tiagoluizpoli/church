import type { QueryClient } from '@tanstack/react-query';
import { INVITATIONS_QUERY_KEY } from '@/features/invitations/invitation-queries';
import { MINISTRIES_QUERY_KEY } from '@/features/ministries/ministry-queries';
import {
  peopleDetailQueryKey,
  peopleQueryKey,
} from '@/features/people/people-queries';

export const CALLER_CAPABILITIES_KEY = ['caller-capabilities'] as const;

interface ResetAfterSelfDemotionInput {
  queryClient: QueryClient;
  churchId: string | undefined;
  memberId: string;
}

interface SelfDemotionReset {
  detailReadable: boolean;
}

/**
 * The caller's own reach shrank: drop every authority-dependent projection
 * before refetching, and report whether the member detail is still readable.
 * Capabilities go first so nothing privileged renders on stale authority.
 */
export async function resetAfterSelfDemotion({
  queryClient,
  churchId,
  memberId,
}: ResetAfterSelfDemotionInput): Promise<SelfDemotionReset> {
  await queryClient.resetQueries({ queryKey: CALLER_CAPABILITIES_KEY });
  await Promise.all([
    queryClient.resetQueries({ queryKey: MINISTRIES_QUERY_KEY }),
    queryClient.resetQueries({ queryKey: INVITATIONS_QUERY_KEY }),
    queryClient.resetQueries({ queryKey: peopleQueryKey({ churchId }) }),
  ]);
  const detail = queryClient.getQueryState(
    peopleDetailQueryKey({ churchId, memberId }),
  );
  return { detailReadable: detail?.status === 'success' };
}
