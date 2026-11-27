import type { IAuthorityManager } from './authority-manager';

export interface AuthorityGuardDependencies {
  manager: IAuthorityManager;
}

/** The authority checks a controller asks for; a subset of `IAuthorityManager`. */
export type IAuthorityGuard = Pick<
  IAuthorityManager,
  | 'decideAuthority'
  | 'decideManageAnyMinistry'
  | 'decideManageMinistry'
  | 'decideManageParticipation'
  | 'decideManageShift'
  | 'canManageChurch'
  | 'canManageMinistry'
  | 'canManageParticipation'
  | 'canManageShift'
  | 'canManageEvent'
  | 'canManageEventTimeBlock'
  | 'resolveCallerCapabilities'
  | 'hasSchedulingAccess'
>;
