import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import {
  type ActiveChurchSwitchedMessage,
  subscribeToActiveChurchSwitch,
} from '@/shared/utils/active-church-broadcast';
import {
  clearActiveChurchScopedCache,
  getActiveChurchDestination,
  isChurchScopedQuery,
} from '@/shared/utils/active-church-switch';

export interface UseActiveChurchTabSyncResult {
  pendingSwitch: ActiveChurchSwitchedMessage | null;
  continueSwitch: () => Promise<void>;
}

/**
 * Active Church is session-wide, not tab-local. When another tab switches
 * it, this tab must stop acting on the former Church immediately (cancel
 * in-flight requests, block further interaction) rather than only on the
 * next user action — a stale screen could otherwise mutate data under the
 * new session context.
 */
export function useActiveChurchTabSync(): UseActiveChurchTabSyncResult {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingSwitch, setPendingSwitch] =
    React.useState<ActiveChurchSwitchedMessage | null>(null);

  React.useEffect(
    () =>
      subscribeToActiveChurchSwitch({
        onMessage: (message) => {
          queryClient.cancelQueries({ predicate: isChurchScopedQuery });
          setPendingSwitch(message);
        },
      }),
    [queryClient],
  );

  const continueSwitch = React.useCallback(async () => {
    if (!pendingSwitch) return;
    await clearActiveChurchScopedCache({ queryClient });
    const destination = getActiveChurchDestination({
      availableAreas: pendingSwitch.availableAreas,
      destination: location.href,
    });
    await navigate({ to: destination });
    setPendingSwitch(null);
  }, [pendingSwitch, queryClient, navigate, location.href]);

  return { pendingSwitch, continueSwitch };
}
