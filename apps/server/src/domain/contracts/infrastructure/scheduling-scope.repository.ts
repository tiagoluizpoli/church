import type { ChurchAccessLevel } from '../../authority/types';
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

export interface ListSchedulingScopesInput {
  userId: UserId;
  churchIds: ChurchId[];
}

/** What decides one User's scheduling access in one Church they belong to. */
export interface SchedulingScope {
  churchId: ChurchId;
  churchAccessLevel: ChurchAccessLevel;
  /** Their active Volunteer profile leads a Ministry there that is not archived. */
  leadsMinistry: boolean;
}

/**
 * Reads the scheduling facts a caller hands to `AuthorityService`: the owning
 * Ministry of a resource identified only by its id, and a User's scheduling
 * scope per Church. Does not itself decide anything — decision-making lives in
 * `AuthorityService`.
 */
export interface SchedulingScopeRepository {
  resolveParticipationMinistry(
    input: ResolveParticipationMinistryInput,
  ): Promise<MinistryId | null>;
  resolveShiftMinistry(
    input: ResolveShiftMinistryInput,
  ): Promise<MinistryId | null>;
  /** One read for every Church; a Church without the User's membership is absent. */
  listSchedulingScopes(
    input: ListSchedulingScopesInput,
  ): Promise<SchedulingScope[]>;
}
