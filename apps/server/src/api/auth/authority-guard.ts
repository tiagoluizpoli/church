import type { AuthorityDecision } from '../../domain/authority/types';
import type {
  AuthorityGuardDependencies,
  IAuthorityGuard,
} from '../../domain/contracts/application/authority-guard';
import type {
  CallerCapabilitiesProjection,
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventTimeBlockInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  DecideAuthorityInput,
  IAuthorityManager,
  ResolveCallerCapabilitiesInput,
} from '../../domain/contracts/application/authority-manager';

/**
 * The controller-facing subset of `IAuthorityManager`, passed straight
 * through. Controllers ask it through the shared guards in `authority-access`
 * (which fix the 403-before-404 order and send the refusal), or directly
 * for an object decision those guards then answer.
 */
export class AuthorityGuard implements IAuthorityGuard {
  private readonly manager: IAuthorityManager;

  constructor({ manager }: AuthorityGuardDependencies) {
    this.manager = manager;
  }

  decideAuthority(input: DecideAuthorityInput): Promise<AuthorityDecision> {
    return this.manager.decideAuthority(input);
  }

  decideManageAnyMinistry(
    input: CanManageChurchInput,
  ): Promise<AuthorityDecision> {
    return this.manager.decideManageAnyMinistry(input);
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
}
