import type { QueryClient } from '@tanstack/react-query';
import { INVITATIONS_QUERY_KEY } from '@/features/invitations/invitation-queries';
import { MINISTRIES_QUERY_KEY } from '@/features/ministries/ministry-queries';
import {
  peopleDetailQueryKey,
  peopleQueryKey,
} from '@/features/people/people-queries';
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';
import { CALLER_CAPABILITIES_QUERY_KEY } from '@/shared/hooks/use-caller-capabilities';

/** Scheduling and availability reads that list a member as qualified, serving or answering. */
export const MEMBERSHIP_READERS = [
  ['availability-checks'],
  ['availability-status'],
  ['my-availability'],
  CYCLE_BUILDER_QUERY_KEY,
  ['assign-cycle'],
  ['ministry-schedule'],
  ['volunteer-dashboard'],
] as const;

interface ResetAfterSelfDemotionInput {
  queryClient: QueryClient;
  churchId: string | undefined;
  memberId: string;
}

interface SelfDemotionReset {
  detailReadable: boolean;
}

/**
 * The caller's own reach shrank: drop every authority-dependent projection,
 * scheduling and availability included, before refetching, and report
 * whether the member detail is still readable. Capabilities go first so
 * nothing privileged renders on stale authority.
 */
export async function resetAfterSelfDemotion({
  queryClient,
  churchId,
  memberId,
}: ResetAfterSelfDemotionInput): Promise<SelfDemotionReset> {
  await queryClient.resetQueries({ queryKey: CALLER_CAPABILITIES_QUERY_KEY });
  const privileged = [
    MINISTRIES_QUERY_KEY,
    INVITATIONS_QUERY_KEY,
    peopleQueryKey({ churchId }),
    ...MEMBERSHIP_READERS,
  ];
  await Promise.all(
    privileged.map((queryKey) => queryClient.resetQueries({ queryKey })),
  );
  const detailKey = peopleDetailQueryKey({ churchId, memberId });
  const detail = queryClient.getQueryState(detailKey);
  return { detailReadable: detail?.status === 'success' };
}
