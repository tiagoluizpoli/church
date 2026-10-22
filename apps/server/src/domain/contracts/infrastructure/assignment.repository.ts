import type {
  AssignmentId,
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryParticipationId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment, AssignmentStatus } from '../../entities/assignment';
import type { TransactionContext } from './transaction-context';

export interface CreateAssignmentInput {
  eventTimeBlockId?: EventTimeBlockId;
  participationId?: MinistryParticipationId;
  shiftId?: ShiftId;
  volunteerId: VolunteerId;
  shiftRequirementId: ShiftRequirementId;
  status?: AssignmentStatus;
  reason?: string;
  assignedBy?: UserId;
}

export interface CreateAssignmentRepositoryInput {
  churchId: ChurchId;
  input: CreateAssignmentInput;
  tx?: TransactionContext;
}

export interface UpdateAssignmentStatusInput {
  status: AssignmentStatus;
  reason?: string;
}

export interface GetAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  tx?: TransactionContext;
}

export interface FindAssignmentByEventTimeBlockAndVolunteerInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface AssignmentsByEventTimeBlockInput {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

export interface AssignmentsByEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListAssignmentsByParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ListAssignmentsByShiftInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  tx?: TransactionContext;
}

export interface ListAssignmentsByVolunteerInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface ListAssignmentsByVolunteersInput {
  churchId: ChurchId;
  volunteerIds: VolunteerId[];
  tx?: TransactionContext;
}

export interface ListAssignmentsByVolunteerInRangeInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  startTime: Date;
  endTime: Date;
  tx?: TransactionContext;
}

export interface ListAssignmentsByRangeInput {
  churchId: ChurchId;
  startTime: Date;
  endTime: Date;
  tx?: TransactionContext;
}

export interface UpdateAssignmentStatusRepositoryInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  input: UpdateAssignmentStatusInput;
  tx?: TransactionContext;
}

export interface CountAssignmentsByVolunteerInRangeInput {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  startTime: Date;
  endTime: Date;
  statusFilter?: AssignmentStatus[];
  tx?: TransactionContext;
}

export interface AssignmentRepository {
  create(input: CreateAssignmentRepositoryInput): Promise<Assignment>;
  getById(input: GetAssignmentInput): Promise<Assignment>;
  findByEventTimeBlockAndVolunteer(
    input: FindAssignmentByEventTimeBlockAndVolunteerInput,
  ): Promise<Assignment | null>;
  listByEventTimeBlock(
    input: AssignmentsByEventTimeBlockInput,
  ): Promise<Assignment[]>;
  listByEvent(input: AssignmentsByEventInput): Promise<Assignment[]>;
  listByParticipation(
    input: ListAssignmentsByParticipationInput,
  ): Promise<Assignment[]>;
  listByShift(input: ListAssignmentsByShiftInput): Promise<Assignment[]>;
  listByVolunteer(
    input: ListAssignmentsByVolunteerInput,
  ): Promise<Assignment[]>;
  listByVolunteers(
    input: ListAssignmentsByVolunteersInput,
  ): Promise<Assignment[]>;
  /** A Volunteer's Assignments whose Shift overlaps `[startTime, endTime)`; touching ends don't overlap. */
  listByVolunteerInRange(
    input: ListAssignmentsByVolunteerInRangeInput,
  ): Promise<Assignment[]>;
  listByRange(input: ListAssignmentsByRangeInput): Promise<Assignment[]>;
  updateStatus(input: UpdateAssignmentStatusRepositoryInput): Promise<void>;
  countByVolunteerInRange(
    input: CountAssignmentsByVolunteerInRangeInput,
  ): Promise<number>;
  deleteByEvent(input: AssignmentsByEventInput): Promise<void>;
  deleteById(input: GetAssignmentInput): Promise<void>;
  listDeclinedByEventTimeBlock(
    input: AssignmentsByEventTimeBlockInput,
  ): Promise<Assignment[]>;
}
