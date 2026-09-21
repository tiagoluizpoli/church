import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { schedulingCapabilitiesApi } from '@/utils/api-instances';

/**
 * Revalidates Scheduling capability after a protected route denies access.
 * A failed revalidation goes to the index, where the caller can retry without
 * treating the failure as either a denial or a grant.
 */
export function useSchedulingAccessFallback({
  shouldRedirect,
}: {
  shouldRedirect: boolean;
}): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!shouldRedirect) return;

    let cancelled = false;
    const redirect = async () => {
      const destination = await resolveSchedulingAccessFallback({
        queryClient,
      });
      if (!cancelled) await navigate({ to: destination, replace: true });
    };

    void redirect();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, shouldRedirect]);
}

export async function resolveSchedulingAccessFallback({
  queryClient,
}: {
  queryClient: QueryClient;
}): Promise<'/scheduling' | '/dashboard'> {
  try {
    const capability =
      await schedulingCapabilitiesApi.getSchedulingCapability();
    queryClient.setQueryData(['scheduling-capability'], capability);
    return capability.canAccessScheduling ? '/scheduling' : '/dashboard';
  } catch {
    return '/scheduling';
  }
}
