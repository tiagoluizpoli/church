import type { QueryClient } from '@tanstack/react-query';
import type { GetActiveChurchStatusResult } from '@/infrastructure/api/active-church';
import { authClient } from '@/lib/auth-client';
import { isFailedSessionStatus, OutageError } from '@/shared/utils/outage';
import { activeChurchApi } from '@/utils/api-instances';

/** Hovering a sidebar link preloads its route, which re-runs the gates; this
 * window keeps those preloads from each hitting the backend. */
export const ENTRY_GATE_STALE_TIME_MS = 30_000;

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;
export const ACTIVE_CHURCH_STATUS_QUERY_KEY = [
  'active-church',
  'status',
] as const;

type Session = Awaited<ReturnType<typeof authClient.getSession>>;

interface EntryGateInput {
  queryClient: QueryClient;
}

/** The session, reused within the window. A failed call says nothing about who
 * is signed in, so it throws instead of looking like "no session"; a missing
 * session is never kept, so signing in is seen at once. */
export async function getCachedSession({
  queryClient,
}: EntryGateInput): Promise<Session> {
  const session = await queryClient.fetchQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const fresh = await authClient.getSession().catch((error: unknown) => {
        throw new OutageError({ cause: error });
      });
      if (fresh.error && isFailedSessionStatus(fresh.error.status)) {
        throw new OutageError({ cause: fresh.error });
      }
      return fresh;
    },
    staleTime: ENTRY_GATE_STALE_TIME_MS,
    // Fail fast: an outage must reach the reconnecting state, not retry behind the guard.
    retry: false,
  });
  if (!session.data) queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
  return session;
}

/** The Active Church status, reused within the window. A status that reports a
 * removed Membership is one-shot server-side, so it is never kept: the
 * redirect it causes must see the next, fresh answer. */
export async function getCachedActiveChurchStatus({
  queryClient,
}: EntryGateInput): Promise<GetActiveChurchStatusResult> {
  const status = await queryClient.fetchQuery({
    queryKey: ACTIVE_CHURCH_STATUS_QUERY_KEY,
    queryFn: () => activeChurchApi.getActiveChurchStatus(),
    staleTime: ENTRY_GATE_STALE_TIME_MS,
    retry: false,
  });
  if (status.membershipRemovedFrom)
    invalidateActiveChurchStatus({ queryClient });
  return status;
}

/** After a church select the cached status describes the old Active Church. */
export function invalidateActiveChurchStatus({
  queryClient,
}: EntryGateInput): void {
  queryClient.removeQueries({ queryKey: ACTIVE_CHURCH_STATUS_QUERY_KEY });
}

/** A retry or reconnect must see the server's answer, not the cached one. */
export function resetEntryGate({ queryClient }: EntryGateInput): void {
  queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
  invalidateActiveChurchStatus({ queryClient });
}
