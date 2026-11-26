import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  RoleId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Cycle } from '../../entities/cycle';
import type { Event, EventWithEventTimeBlocks } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type { UnavailableShift } from '../../entities/unavailable-shift';
import type {
  CandidateFacts,
  IParticipationReader,
  VolunteerMembershipInfo,
} from './participation-reader';
import type { IScheduleChangeReader } from './schedule-change-reader';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

export interface GetCycleBuilderDataInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  userId: UserId;
}

export interface CycleBuilderShiftView {
  shift: Shift;
  requirements: CycleBuilderRequirementView[];
  assignments: CycleBuilderAssignmentView[];
  eligibleVolunteers: EligibleVolunteerView[];
}

export interface CycleBuilderAssignmentView {
  assignment: Assignment;
  lateMark: boolean;
}

/** A requirement as the Cycle Builder read returns it. */
export interface CycleBuilderRequirementView {
  requirement: ShiftRequirement;
}

export interface CycleBuilderEventTimeBlockView {
  eventTimeBlock: EventTimeBlock;
  included: boolean;
  /** The block or its Event was cancelled: read-only, asks for nobody. */
  cancelled: boolean;
  shifts: CycleBuilderShiftView[];
}

export interface CycleBuilderEventView {
  participation: MinistryParticipation;
  event: Event;
  eventTimeBlocks: CycleBuilderEventTimeBlockView[];
}

export interface CycleBuilderRoleOption {
  id: RoleId;
  name: string;
}

export interface CycleBuilderView {
  affectedVolunteerCount: number;
  cycle: Cycle;
  events: CycleBuilderEventView[];
  roles: CycleBuilderRoleOption[];
}

export interface EligibleVolunteerView {
  volunteerId: VolunteerId;
  volunteerName: string;
  answerState: 'available' | 'unanswered' | 'not_asked' | 'unavailable';
  conflict: {
    assignmentId: string;
    ministryName: string;
    eventTitle: string;
    startTime: Instant;
    endTime: Instant;
  } | null;
  lastServedAt?: Instant;
  /**
   * Every role this volunteer is qualified for in the ministry — not only the
   * roles the current shift requires. The builder shows it as the member's
   * standing skill set, so narrowing it to the shift would make the same person
   * read differently from one event time block to the next.
   */
  qualifiedRoleIds: string[];
  /** This volunteer's ministry-wide Ministry Access Level. */
  ministryAccessLevel: MinistryAccessLevel;
}

export interface ListEligibleVolunteersInput {
  churchId: ChurchId;
  shiftId: ShiftId;
}

export interface BuildEligibleVolunteerViewInput {
  volunteerId: string;
  volunteerName: string;
  answerState: EligibleVolunteerView['answerState'];
  conflict: EligibleVolunteerView['conflict'];
  lastServedAt?: Instant;
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

export interface QualifiedVolunteerRef {
  id: EligibleVolunteerView['volunteerId'];
  name?: string | null;
}

export interface BuildEligibleForVolunteerInput {
  volunteer: QualifiedVolunteerRef;
  shift: Shift;
  activeAssignments: Assignment[];
  fairnessAssignments: Assignment[];
  assignmentShiftsById: Map<string, Shift>;
  unavailableShiftKeys: Set<string>;
  membershipInfoByVolunteerId: Map<string, VolunteerMembershipInfo>;
  checkStates: Map<string, 'pending' | 'confirmed'>;
  conflictDetails: Map<
    string,
    Omit<NonNullable<EligibleVolunteerView['conflict']>, 'assignmentId'>
  >;
}

export interface SortEligibleVolunteersInput {
  eligible: EligibleVolunteerView[];
  assignments: Assignment[];
}

export interface ListEligibleForShiftsInput {
  candidateFacts: CandidateFacts;
  churchId: ChurchId;
  participation: MinistryParticipation;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  membershipInfoByVolunteerId: Map<string, VolunteerMembershipInfo>;
  checkStates: Map<string, 'pending' | 'confirmed'>;
  tx?: TransactionContext;
}

export interface ListQualifiedVolunteersForShiftInput {
  churchId: ListEligibleVolunteersInput['churchId'];
  participation: MinistryParticipation;
  requirements: ShiftRequirement[];
  tx?: TransactionContext;
}

export interface BuildBuilderEventViewInput {
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  includedEventTimeBlockIds: Set<string>;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  assignments: Assignment[];
  marks: UnavailableShift[];
  eligibleByShift: Map<string, EligibleVolunteerView[]>;
}

export interface RangesOverlapInput {
  startTime: Instant;
  endTime: Instant;
  otherStartTime: Instant;
  otherEndTime: Instant;
}

export interface DbScheduleBuilderReaderDependencies {
  assignmentRepository: AssignmentRepository;
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  ministryRepository: MinistryRepository;
  participationRepository: MinistryParticipationRepository;
  roleRepository: RoleRepository;
  shiftRepository: ShiftRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  unitOfWork: UnitOfWork;
  volunteerRepository: VolunteerRepository;
  participationReader: IParticipationReader;
  scheduleChangeReader: IScheduleChangeReader;
}

export interface IScheduleBuilderReader {
  getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView>;
  listEligibleVolunteers(
    input: ListEligibleVolunteersInput,
  ): Promise<EligibleVolunteerView[]>;
}
