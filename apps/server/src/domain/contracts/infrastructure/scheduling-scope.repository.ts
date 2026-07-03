import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '../../branded-ids';

export interface ResolveParticipationMinistryInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ResolveShiftMinistryInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

export interface IsChurchAdminInput {
  churchId: ChurchId;
  userId: UserId;
}

export interface IsMinistryLeaderInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface SchedulingScopeRepository {
  resolveParticipationMinistry(
    input: ResolveParticipationMinistryInput,
  ): Promise<MinistryId | null>;
  resolveShiftMinistry(
    input: ResolveShiftMinistryInput,
  ): Promise<MinistryId | null>;
  isChurchAdmin(input: IsChurchAdminInput): Promise<boolean>;
  isMinistryLeader(input: IsMinistryLeaderInput): Promise<boolean>;
}
