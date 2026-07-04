import type {
  AssignmentId,
  ChurchId,
  EventId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment, AssignmentStatus } from '../../entities/assignment';
import type { TransactionContext } from './transaction-context';

export interface CreateAssignmentInput {
  slotId?: TimeSlotId;
  participationId?: MinistryParticipationId;
  shiftId?: ShiftId;
  volunteerId: VolunteerId;
  roleId: RoleId;
  status?: AssignmentStatus;
  reason?: string;
  assignedBy?: UserId;
}

export interface UpdateAssignmentStatusInput {
  status: AssignmentStatus;
  reason?: string;
}

export interface AssignmentRepository {
  create(
    churchId: ChurchId,
    input: CreateAssignmentInput,
    tx?: TransactionContext,
  ): Promise<Assignment>;

  getById(
    churchId: ChurchId,
    id: AssignmentId,
    tx?: TransactionContext,
  ): Promise<Assignment>;

  findBySlotAndVolunteer(
    churchId: ChurchId,
    slotId: TimeSlotId,
    volunteerId: VolunteerId,
    tx?: TransactionContext,
  ): Promise<Assignment | null>;

  listBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
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

  listDeclinedBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
    tx?: TransactionContext,
  ): Promise<Assignment[]>;
}
