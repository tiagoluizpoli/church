import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
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

/**
 * Resolves the calling `AuthorityActor` and the Ministry owning a bare
 * resource id (Participation, Shift, Event, TimeSlot), then asks
 * `AuthorityService` for a `manage` decision. Supersedes `SchedulingRbacManager`
 * for callers migrated onto AuthorityService.
 */
export interface IAuthorityManager {
  canManageChurch(input: CanManageChurchInput): Promise<boolean>;
  canManageMinistry(input: CanManageMinistryInput): Promise<boolean>;
  canManageParticipation(input: CanManageParticipationInput): Promise<boolean>;
  canManageShift(input: CanManageShiftInput): Promise<boolean>;
  canManageEvent(input: CanManageEventInput): Promise<boolean>;
  canManageEventSlot(input: CanManageEventSlotInput): Promise<boolean>;
  /**
   * True if `AuthorityService` grants `manage` on the Church, or on any one
   * Ministry the actor belongs to — no single resource to name, so this asks
   * per candidate resource rather than a single call. Exists for the
   * frontend's nav-visibility probe (`useCallerRoles`, research.md R1): there
   * is no "my roles" endpoint, so visibility is derived from whether this
   * lightweight, role-gated query is forbidden.
   */
  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean>;
}
