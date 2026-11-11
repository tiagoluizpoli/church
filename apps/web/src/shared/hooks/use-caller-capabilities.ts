import { useQuery } from '@tanstack/react-query';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { callerCapabilitiesApi } from '@/utils/api-instances';

export interface CallerCapabilities {
  isChurchAdmin: boolean;
  leadsMinistries: boolean;
  hasVolunteerMembership: boolean;
}

export const isAdminOrLeader = (capabilities: CallerCapabilities) =>
  capabilities.isChurchAdmin || capabilities.leadsMinistries;

export interface CallerCapabilitiesState extends CallerCapabilities {
  isResolving: boolean;
  /** Ministries the caller leads, for scoping reads that narrow with authority. */
  ledMinistryIds: string[];
  /** The read failed (or answered for another Church): all capabilities are false, but this is not a "no capacity" result. */
  isError: boolean;
  retry: () => void;
}

/** Root of every caller-capabilities read; reset it when the caller's own authority changes. */
export const CALLER_CAPABILITIES_QUERY_KEY = ['caller-capabilities'] as const;

const NO_CAPABILITIES: CallerCapabilities = {
  isChurchAdmin: false,
  leadsMinistries: false,
  hasVolunteerMembership: false,
};
const NO_LED_MINISTRIES: string[] = [];

/**
 * Resolves what the caller may do in the Active Church from the server's
 * capability projection. Loading, error and a projection for another Church
 * all read as no capability: a failed read never becomes an implicit grant.
 * `isError` tells a failed read apart from a successful no-capacity result.
 */
export function useCallerCapabilities(): CallerCapabilitiesState {
  const scope = useCallerCapabilitiesScope();
  const callerCapabilitiesQuery = useQuery({
    queryKey: [
      ...CALLER_CAPABILITIES_QUERY_KEY,
      scope?.userId,
      scope?.churchId,
    ],
    queryFn: () => callerCapabilitiesApi.getCallerCapabilities(),
    enabled: Boolean(scope?.userId && scope.churchId),
    retry: false,
  });

  const retry = () => {
    callerCapabilitiesQuery.refetch();
  };

  if (!scope || callerCapabilitiesQuery.isLoading) {
    return {
      ...NO_CAPABILITIES,
      ledMinistryIds: NO_LED_MINISTRIES,
      isResolving: true,
      isError: false,
      retry,
    };
  }

  const capabilities = callerCapabilitiesQuery.data;
  if (
    callerCapabilitiesQuery.isError ||
    capabilities?.churchId !== scope.churchId
  ) {
    return {
      ...NO_CAPABILITIES,
      ledMinistryIds: NO_LED_MINISTRIES,
      isResolving: false,
      isError: true,
      retry,
    };
  }

  return {
    isChurchAdmin: capabilities.isChurchAdmin,
    leadsMinistries: capabilities.ledMinistries.length > 0,
    hasVolunteerMembership: capabilities.hasVolunteerMembership,
    ledMinistryIds: capabilities.ledMinistries.map(
      ({ ministryId }) => ministryId,
    ),
    isResolving: false,
    isError: false,
    retry,
  };
}
