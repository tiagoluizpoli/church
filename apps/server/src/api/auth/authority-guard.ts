import type { AuthorityDecision } from '../../domain/authority/types';
import type {
  CallerCapabilitiesProjection,
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventTimeBlockInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  DecideAuthorityInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  ResolveCallerCapabilitiesInput,
} from '../../domain/contracts/application/authority-manager';

interface AuthorityGuardDependencies {
  manager: IAuthorityManager;
}

/**
 * Controller-facing wrapper around `IAuthorityManager` — supersedes
 * `SchedulingRbacGuard` and the inline `ctx.isAdmin` / `ctx.isLeader`
 * route-role checks it replaces. Every controller authorization check goes
 * through here.
 */
export class AuthorityGuard {
  private readonly manager: IAuthorityManager;

  constructor({ manager }: AuthorityGuardDependencies) {
    this.manager = manager;
  }

  decideAuthority(input: DecideAuthorityInput): Promise<AuthorityDecision> {
    return this.manager.decideAuthority(input);
  }

  decideManageMinistry(
    input: CanManageMinistryInput,
  ): Promise<AuthorityDecision> {
    return this.manager.decideManageMinistry(input);
  }

  decideManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<AuthorityDecision> {
    return this.manager.decideManageParticipation(input);
  }

  decideManageShift(input: CanManageShiftInput): Promise<AuthorityDecision> {
    return this.manager.decideManageShift(input);
  }

  canManageChurch(input: CanManageChurchInput): Promise<boolean> {
    return this.manager.canManageChurch(input);
  }

  canManageMinistry(input: CanManageMinistryInput): Promise<boolean> {
    return this.manager.canManageMinistry(input);
  }

  canManageParticipation(input: CanManageParticipationInput): Promise<boolean> {
    return this.manager.canManageParticipation(input);
  }

  canManageShift(input: CanManageShiftInput): Promise<boolean> {
    return this.manager.canManageShift(input);
  }

  canManageEvent(input: CanManageEventInput): Promise<boolean> {
    return this.manager.canManageEvent(input);
  }

  canManageEventTimeBlock(
    input: CanManageEventTimeBlockInput,
  ): Promise<boolean> {
    return this.manager.canManageEventTimeBlock(input);
  }

  resolveCallerCapabilities(
    input: ResolveCallerCapabilitiesInput,
  ): Promise<CallerCapabilitiesProjection> {
    return this.manager.resolveCallerCapabilities(input);
  }

  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean> {
    return this.manager.hasSchedulingAccess(input);
  }
}
