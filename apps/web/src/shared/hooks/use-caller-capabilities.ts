import { useQuery } from '@tanstack/react-query';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { callerCapabilitiesApi } from '@/utils/api-instances';

export interface CallerCapabilities {
  isChurchAdmin: boolean;
  leadsMinistries: boolean;
  hasVolunteerMembership: boolean;
}

export interface CallerCapabilitiesState extends CallerCapabilities {
  isResolving: boolean;
}

const NO_CAPABILITIES: CallerCapabilities = {
  isChurchAdmin: false,
  leadsMinistries: false,
  hasVolunteerMembership: false,
};

/**
 * Resolves what the caller may do in the Active Church from the server's
 * capability projection. Loading, error and a projection for another Church
 * all read as no capability: a failed read never becomes an implicit grant.
 */
export function useCallerCapabilities(): CallerCapabilitiesState {
  const scope = useCallerCapabilitiesScope();
  const callerCapabilitiesQuery = useQuery({
    queryKey: ['caller-capabilities', scope?.userId, scope?.churchId],
    queryFn: () => callerCapabilitiesApi.getCallerCapabilities(),
    enabled: Boolean(scope?.userId && scope.churchId),
    retry: false,
  });

  if (!scope || callerCapabilitiesQuery.isLoading) {
    return { ...NO_CAPABILITIES, isResolving: true };
  }

  const capabilities = callerCapabilitiesQuery.data;
  if (
    callerCapabilitiesQuery.isError ||
    capabilities?.churchId !== scope.churchId
  ) {
    return { ...NO_CAPABILITIES, isResolving: false };
  }

  return {
    isChurchAdmin: capabilities.isChurchAdmin,
    leadsMinistries: capabilities.ledMinistries.length > 0,
    hasVolunteerMembership: capabilities.hasVolunteerMembership,
    isResolving: false,
  };
}
