import { inject, injectable } from 'tsyringe';
import type {
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventSlotInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
} from '../../domain/contracts/application/authority-manager';

/**
 * Controller-facing wrapper around `IAuthorityManager` — supersedes
 * `SchedulingRbacGuard` and the inline `ctx.isAdmin` / `ctx.isLeader`
 * route-role checks it replaces. Every controller authorization check goes
 * through here.
 */
@injectable()
export class AuthorityGuard {
  constructor(
    @inject('IAuthorityManager')
    private readonly manager: IAuthorityManager,
  ) {}

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

  canManageEventSlot(input: CanManageEventSlotInput): Promise<boolean> {
    return this.manager.canManageEventSlot(input);
  }

  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean> {
    return this.manager.hasSchedulingAccess(input);
  }
}
