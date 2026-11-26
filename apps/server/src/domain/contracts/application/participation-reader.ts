import type {
  ChurchId,
  MinistryId,
  RoleId,
  SectorId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Cycle } from '../../entities/cycle';
import type { EventWithEventTimeBlocks } from '../../entities/event';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { GetCycleParticipationInput } from './prepare-manager';
import type { EligibleVolunteerView } from './schedule-builder-reader';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '@/domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

export type AvailabilityCheckStateValue = 'pending' | 'confirmed';

export interface GetOrCreateParticipationInput
  extends GetCycleParticipationInput {
  eventId: EventWithEventTimeBlocks['event']['id'];
  tx: TransactionContext;
}

/**
 * Per-volunteer membership facts read once per cycle/shift lookup and reused
 * across every shift — qualification and ministry-wide access level.
 */
export interface VolunteerMembershipInfo {
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

export interface ListVolunteerMembershipInfoInput {
  churchId: ChurchId;
  ministryId: MinistryParticipation['ministryId'];
  tx?: TransactionContext;
}

export interface LoadCheckStatesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: Cycle['id'];
  tx?: TransactionContext;
}

export interface LoadCandidateFactsInput {
  churchId: ChurchId;
  volunteerIds: VolunteerId[];
  tx?: TransactionContext;
}

export interface CandidateFacts {
  activeAssignments: Assignment[];
  assignmentShiftsById: Map<string, Shift>;
  unavailableShiftKeys: Set<string>;
  conflictDetails: Map<
    string,
    Omit<NonNullable<EligibleVolunteerView['conflict']>, 'assignmentId'>
  >;
}

export interface HeadcountPlace {
  sectorId: SectorId;
  roleId: RoleId;
}

export interface AssertMinistryHeadcountsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  headcounts: HeadcountPlace[];
  tx: TransactionContext;
}

export interface DbParticipationReaderDependencies {
  assignmentRepository: AssignmentRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  ministryRepository: MinistryRepository;
  participationRepository: MinistryParticipationRepository;
  roleRepository: RoleRepository;
  sectorRepository: SectorRepository;
  shiftRepository: ShiftRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  volunteerRepository: VolunteerRepository;
}

export interface IParticipationReader {
  /** A new participation is new use: refused for an archived Ministry. */
  getOrCreateParticipation(
    input: GetOrCreateParticipationInput,
  ): Promise<MinistryParticipation>;
  /** Availability check state per Volunteer id for one Ministry and Cycle. */
  loadCheckStates(
    input: LoadCheckStatesInput,
  ): Promise<Map<string, AvailabilityCheckStateValue>>;
  listVolunteerMembershipInfo(
    input: ListVolunteerMembershipInfoInput,
  ): Promise<Map<string, VolunteerMembershipInfo>>;
  loadCandidateFacts(input: LoadCandidateFactsInput): Promise<CandidateFacts>;
  assertMinistryHeadcounts(input: AssertMinistryHeadcountsInput): Promise<void>;
}
