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

export interface AssignmentRepository {
  create(input: CreateAssignmentRepositoryInput): Promise<Assignment>;

  getById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<Assignment>;

  findByEventTimeBlockAndVolunteer(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment | null>;

  listByEventTimeBlock(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByParticipation(
    churchId: ChurchId,
    participationId: MinistryParticipationId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByShift(
    churchId: ChurchId,
    shiftId: ShiftId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByVolunteer(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  /** A Volunteer's Assignments whose Shift overlaps `[startTime, endTime)`; touching ends don't overlap. */
  listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  listByRange(
    churchId: ChurchId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;

  updateStatus(
    churchId: ChurchId,
    id: AssignmentId,
    input: UpdateAssignmentStatusInput,
    tx?: TransactionContext,
  ): Promise<void>;

  countByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    statusFilter?: AssignmentStatus[],
    tx?: TransactionContext,
  ): Promise<number>;

  deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void>;

  deleteById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<void>;

  listDeclinedByEventTimeBlock(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;
}
