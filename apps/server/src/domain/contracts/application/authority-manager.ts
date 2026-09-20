import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  TeamId,
  TimeSlotId,
  UserId,
} from '../../branded-ids';

export interface CanManageChurchInput {
  churchId: ChurchId;
  userId: UserId;
}

export interface CanManageMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface CanManageTeamInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  teamId: TeamId;
  userId: UserId;
}

export interface CanManageTeamShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  teamId: TeamId;
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

export interface CanManageEventSlotInput {
  churchId: ChurchId;
  slotId: TimeSlotId;
  userId: UserId;
}

export interface HasSchedulingAccessInput {
  churchId: ChurchId;
  userId: UserId;
}

export type SchedulingCapabilityEntry =
  | { kind: 'church' }
  | { kind: 'ministry'; ministryId: MinistryId; name: string }
  | {
      kind: 'team';
      ministryId: MinistryId;
      ministryName: string;
      teamId: TeamId;
      name: string;
    };

/** Navigation data only; every protected resource still asks AuthorityService. */
export interface SchedulingCapabilityProjection {
  canAccessScheduling: boolean;
  entries: SchedulingCapabilityEntry[];
}

/**
 * Resolves the calling `AuthorityActor` and the Ministry owning a bare
 * resource id (Participation, Shift, Event, TimeSlot), then asks
 * `AuthorityService` for a `manage` decision. Supersedes `SchedulingRbacManager`
 * for callers migrated onto AuthorityService.
 */
export interface IAuthorityManager {
  canManageChurch(input: CanManageChurchInput): Promise<boolean>;
  canManageMinistry(input: CanManageMinistryInput): Promise<boolean>;
  canManageTeam(input: CanManageTeamInput): Promise<boolean>;
  canManageTeamShift(input: CanManageTeamShiftInput): Promise<boolean>;
  canManageParticipation(input: CanManageParticipationInput): Promise<boolean>;
  canManageShift(input: CanManageShiftInput): Promise<boolean>;
  canManageEvent(input: CanManageEventInput): Promise<boolean>;
  canManageEventSlot(input: CanManageEventSlotInput): Promise<boolean>;
  resolveSchedulingCapability(
    input: HasSchedulingAccessInput,
  ): Promise<SchedulingCapabilityProjection>;
  /**
   * Compatibility boolean for server-only callers such as the active-Church
   * selector. It delegates to the Scheduling capability projection.
   */
  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean>;
}
