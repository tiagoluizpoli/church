import { useQuery } from '@tanstack/react-query';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { callerCapabilitiesApi } from '@/utils/api-instances';

export interface CallerNavVisibility {
  canSeeScheduling: boolean;
  isResolving: boolean;
}

/**
 * Resolves Scheduling navigation from the server's Active-Church capability
 * projection. A failed projection never becomes an implicit grant.
 */
export function useCallerRoles(): CallerNavVisibility {
  const scope = useCallerCapabilitiesScope();
  const callerCapabilitiesQuery = useQuery({
    queryKey: ['caller-capabilities', scope?.userId, scope?.churchId],
    queryFn: () => callerCapabilitiesApi.getCallerCapabilities(),
    enabled: Boolean(scope?.userId && scope.churchId),
    retry: false,
  });

  if (!scope || callerCapabilitiesQuery.isLoading) {
    return { canSeeScheduling: false, isResolving: true };
  }

  if (callerCapabilitiesQuery.isError) {
    return { canSeeScheduling: false, isResolving: false };
  }

  const capabilities = callerCapabilitiesQuery.data;
  const belongsToCurrentChurch = capabilities?.churchId === scope.churchId;

  return {
    canSeeScheduling:
      belongsToCurrentChurch &&
      (capabilities.isChurchAdmin || capabilities.ledMinistries.length > 0),
    isResolving: false,
  };
}
