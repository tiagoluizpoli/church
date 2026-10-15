import type {
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventTimeBlockInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  CanManageTeamInput,
  CanManageTeamShiftInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  SchedulingCapabilityProjection,
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

  canManageChurch(input: CanManageChurchInput): Promise<boolean> {
    return this.manager.canManageChurch(input);
  }

  canManageMinistry(input: CanManageMinistryInput): Promise<boolean> {
    return this.manager.canManageMinistry(input);
  }

  canManageTeam(input: CanManageTeamInput): Promise<boolean> {
    return this.manager.canManageTeam(input);
  }

  canManageTeamShift(input: CanManageTeamShiftInput): Promise<boolean> {
    return this.manager.canManageTeamShift(input);
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

  resolveSchedulingCapability(
    input: HasSchedulingAccessInput,
  ): Promise<SchedulingCapabilityProjection> {
    return this.manager.resolveSchedulingCapability(input);
  }

  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean> {
    return this.manager.hasSchedulingAccess(input);
  }
}
