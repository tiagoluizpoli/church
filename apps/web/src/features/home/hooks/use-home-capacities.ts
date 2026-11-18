import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

export interface HomeCapacities {
  /** Church section: ChurchAdmin. */
  church: boolean;
  /** Ministries I lead: ChurchAdmin (every Ministry) or a Ministry leader. */
  leadership: boolean;
  /** My serving: serving membership only. */
  serving: boolean;
  /** Identity of the leadership authority (admin flag + led Ministries); changes when it grows or shrinks. */
  leadershipScope: string;
}

export type HomeCapacityState =
  | { status: 'resolving' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; capacities: HomeCapacities };

/**
 * Additive Home capacities from the caller-capabilities boundary. `ready`
 * with no capacity is the only plain-member result; a failed read is `error`.
 */
export function useHomeCapacities(): HomeCapacityState {
  const capabilities = useCallerCapabilities();
  if (capabilities.isResolving) return { status: 'resolving' };
  if (capabilities.isError) {
    return { status: 'error', retry: capabilities.retry };
  }
  const { isChurchAdmin, ledMinistryIds } = capabilities;
  const leadershipScope = `${isChurchAdmin ? 'admin' : 'leader'}:${[...ledMinistryIds].sort().join(',')}`;
  return {
    status: 'ready',
    capacities: {
      church: capabilities.isChurchAdmin,
      leadership: capabilities.isChurchAdmin || capabilities.leadsMinistries,
      serving: capabilities.hasVolunteerMembership,
      leadershipScope,
    },
  };
}
