import { useQuery } from '@tanstack/react-query';
import { schedulingCapabilitiesApi } from '@/utils/api-instances';

export interface CallerNavVisibility {
  canSeeScheduling: boolean;
  isResolving: boolean;
}

/**
 * Resolves Scheduling navigation from the server's Active-Church capability
 * projection. A failed projection never becomes an implicit grant.
 */
export function useCallerRoles(): CallerNavVisibility {
  const schedulingCapabilityQuery = useQuery({
    queryKey: ['scheduling-capability'],
    queryFn: () => schedulingCapabilitiesApi.getSchedulingCapability(),
    retry: false,
  });

  if (schedulingCapabilityQuery.isLoading) {
    return { canSeeScheduling: false, isResolving: true };
  }

  return {
    canSeeScheduling:
      schedulingCapabilityQuery.data?.canAccessScheduling === true,
    isResolving: false,
  };
}
