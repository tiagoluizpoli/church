import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
} from '../../branded-ids';

export interface ResolveParticipationMinistryInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ResolveShiftMinistryInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

/**
 * Resolves the owning Ministry for a scheduling resource identified only by
 * its id, so a caller can hand that Ministry to `AuthorityService`. Does not
 * itself decide anything — decision-making lives in `AuthorityService`.
 */
export interface SchedulingScopeRepository {
  resolveParticipationMinistry(
    input: ResolveParticipationMinistryInput,
  ): Promise<MinistryId | null>;
  resolveShiftMinistry(
    input: ResolveShiftMinistryInput,
  ): Promise<MinistryId | null>;
}
