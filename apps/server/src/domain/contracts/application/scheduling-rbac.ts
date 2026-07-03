import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '../../branded-ids';

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

export interface CanManageMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface SchedulingRbacManager {
  canManageParticipation(input: CanManageParticipationInput): Promise<boolean>;
  canManageShift(input: CanManageShiftInput): Promise<boolean>;
  canManageMinistry(input: CanManageMinistryInput): Promise<boolean>;
}
