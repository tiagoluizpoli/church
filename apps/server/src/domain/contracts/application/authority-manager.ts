import type {
  AuthorityAction,
  AuthorityDecision,
  AuthorityResource,
  AuthorityScope,
} from '../../authority/types';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '../../branded-ids';

/** Target facts must come from a Church-scoped repository; null is a missing target. */
export interface DecideAuthorityInput {
  churchId: ChurchId;
  userId: UserId;
  action: AuthorityAction;
  resource: AuthorityResource | null;
  scope: AuthorityScope;
}

export interface CanManageChurchInput {
  churchId: ChurchId;
  userId: UserId;
}

export interface CanManageMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface CanManageParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  userId: UserId;
}

export interface CanManageShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  userId: UserId;
}

export interface CanManageEventInput {
  churchId: ChurchId;
  eventId: EventId;
  userId: UserId;
}

export interface CanManageEventTimeBlockInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  userId: UserId;
}

export interface HasSchedulingAccessInput {
  churchId: ChurchId;
  userId: UserId;
}

export interface ResolveCallerCapabilitiesInput {
  churchId: ChurchId;
  userId: UserId;
}

export interface LedMinistryCapability {
  ministryId: MinistryId;
  name: string;
}

/** Navigation data only; protected resources still ask AuthorityService. */
export interface CallerCapabilitiesProjection {
  churchId: ChurchId;
  isChurchAdmin: boolean;
  ledMinistries: LedMinistryCapability[];
  hasVolunteerMembership: boolean;
}

/**
 * Resolves the calling `AuthorityActor` and the Ministry owning a bare
 * resource id (Participation, Shift, Event, EventTimeBlock), then asks
 * `AuthorityService` for a `manage` decision. Supersedes `SchedulingRbacManager`
 * for callers migrated onto AuthorityService.
 */
export interface IAuthorityManager {
  decideAuthority(input: DecideAuthorityInput): Promise<AuthorityDecision>;
  decideManageAnyMinistry(
    input: CanManageChurchInput,
  ): Promise<AuthorityDecision>;
  decideManageMinistry(
    input: CanManageMinistryInput,
  ): Promise<AuthorityDecision>;
  decideManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<AuthorityDecision>;
  decideManageShift(input: CanManageShiftInput): Promise<AuthorityDecision>;
  canManageChurch(input: CanManageChurchInput): Promise<boolean>;
  canManageMinistry(input: CanManageMinistryInput): Promise<boolean>;
  canManageParticipation(input: CanManageParticipationInput): Promise<boolean>;
  canManageShift(input: CanManageShiftInput): Promise<boolean>;
  canManageEvent(input: CanManageEventInput): Promise<boolean>;
  canManageEventTimeBlock(
    input: CanManageEventTimeBlockInput,
  ): Promise<boolean>;
  resolveCallerCapabilities(
    input: ResolveCallerCapabilitiesInput,
  ): Promise<CallerCapabilitiesProjection>;
  /**
   * Compatibility boolean for server-only callers such as the active-Church
   * selector. It delegates to the caller-capabilities projection.
   */
  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean>;
}
