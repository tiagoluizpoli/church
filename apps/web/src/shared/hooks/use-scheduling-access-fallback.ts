import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { callerCapabilitiesApi } from '@/utils/api-instances';

interface CallerCapabilitiesScope {
  churchId: string;
  userId: string;
}

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
  const scope = useCallerCapabilitiesScope();

  useEffect(() => {
    if (!shouldRedirect || !scope?.userId) return;

    const currentScope: CallerCapabilitiesScope = {
      churchId: scope.churchId,
      userId: scope.userId,
    };

    let cancelled = false;
    const redirect = async () => {
      const destination = await resolveSchedulingAccessFallback({
        queryClient,
        scope: currentScope,
      });
      if (!cancelled) await navigate({ to: destination, replace: true });
    };

    void redirect();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, scope, shouldRedirect]);
}

export async function resolveSchedulingAccessFallback({
  queryClient,
  scope,
}: {
  queryClient: QueryClient;
  scope?: CallerCapabilitiesScope;
}): Promise<'/scheduling' | '/dashboard'> {
  try {
    const capability = await callerCapabilitiesApi.getCallerCapabilities();
    if (scope && capability.churchId !== scope.churchId) return '/dashboard';
    if (scope) {
      queryClient.setQueryData(
        ['caller-capabilities', scope.userId, scope.churchId],
        capability,
      );
    }
    return capability.isChurchAdmin || capability.ledMinistries.length > 0
      ? '/scheduling'
      : '/dashboard';
  } catch {
    return '/scheduling';
  }
}
