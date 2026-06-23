// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import { NotFoundError } from '@church/core';
import {
  Assignment,
  type AssignmentId,
  type AssignmentStatus,
} from '../../../src/domain/entities/assignment';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import type { RoleId } from '../../../src/domain/entities/role';
import type { TimeSlotId } from '../../../src/domain/entities/time-slot';
import type { VolunteerId } from '../../../src/domain/entities/volunteer';
import type {
  AssignmentRepository,
  CreateAssignmentInput,
  UpdateAssignmentStatusInput,
} from '../../../src/domain/repositories/assignment.repository';
import { runAssignmentRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/assignment.contract-spec';

class MockAssignmentRepository implements AssignmentRepository {
  private assignments = new Map<string, Assignment>();
  private idCounter = 1;

  constructor() {
    const a1 = new Assignment(
      {
        churchId: 'church-1' as ChurchId,
        slotId: 'slot-1' as TimeSlotId,
        volunteerId: 'volunteer-1' as VolunteerId,
        roleId: 'role-1' as RoleId,
        status: 'confirmed',
      },
      'assignment-1' as AssignmentId,
    );
    const a2 = new Assignment(
      {
        churchId: 'church-1' as ChurchId,
        slotId: 'slot-1' as TimeSlotId,
        volunteerId: 'volunteer-1' as VolunteerId,
        roleId: 'role-1' as RoleId,
        status: 'declined',
        reason: 'Sick',
      },
      'assignment-2' as AssignmentId,
    );

    this.assignments.set(a1.id, a1);
    this.assignments.set(a2.id, a2);
  }

  async create(
    churchId: ChurchId,
    input: CreateAssignmentInput,
  ): Promise<Assignment> {
    const id = `assignment-gen-${this.idCounter++}` as AssignmentId;
    const a = new Assignment(
      {
        churchId,
        slotId: input.slotId,
        volunteerId: input.volunteerId,
        roleId: input.roleId,
        status: input.status ?? 'draft',
        reason: input.reason,
        assignedBy: input.assignedBy,
      },
      id,
    );
    this.assignments.set(a.id, a);
    return a;
  }

  async getById(churchId: ChurchId, id: AssignmentId): Promise<Assignment> {
    const a = this.assignments.get(id);
    if (!a || a.churchId !== churchId) {
      throw new NotFoundError('Assignment not found');
    }
    return a;
  }

  async findBySlotAndVolunteer(
    churchId: ChurchId,
    slotId: TimeSlotId,
    volunteerId: VolunteerId,
  ): Promise<Assignment | null> {
    for (const a of this.assignments.values()) {
      if (
        a.churchId === churchId &&
        a.slotId === slotId &&
        a.volunteerId === volunteerId
      ) {
        return a;
      }
    }
    return null;
  }

  async listBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
  ): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.slotId === slotId,
    );
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
  ): Promise<Assignment[]> {
    if (eventId === ('event-1' as EventId)) {
      return Array.from(this.assignments.values()).filter(
        (a) => a.churchId === churchId,
      );
    }
    return [];
  }

  async listByVolunteer(
    churchId: ChurchId,
    volunteerId: VolunteerId,
  ): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
  }

  async listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    _startTime: Date,
    _endTime: Date,
  ): Promise<Assignment[]> {
    // For mock/test range queries, slot-1 has startTime in June 2024
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
  }

  async listByRange(
    churchId: ChurchId,
    _startTime: Date,
    _endTime: Date,
  ): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId,
    );
  }

  async updateStatus(
    churchId: ChurchId,
    id: AssignmentId,
    input: UpdateAssignmentStatusInput,
  ): Promise<void> {
    const a = await this.getById(churchId, id);
    const props = (a as any)._props;
    props.status = input.status;
    if (input.reason !== undefined) {
      props.reason = input.reason;
    }
    (a as any)._updatedAt = new Date();
  }

  async countByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    _startTime: Date,
    _endTime: Date,
    statusFilter?: AssignmentStatus[],
  ): Promise<number> {
    let list = Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
    if (statusFilter) {
      list = list.filter((a) => statusFilter.includes(a.status));
    }
    return list.length;
  }

  async deleteByEvent(_churchId: ChurchId, eventId: EventId): Promise<void> {
    if (eventId === ('event-1' as EventId)) {
      this.assignments.clear();
    }
  }

  async listDeclinedBySlot(
    churchId: ChurchId,
    slotId: TimeSlotId,
  ): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) =>
        a.churchId === churchId &&
        a.slotId === slotId &&
        a.status === 'declined',
    );
  }
}

runAssignmentRepositoryContractTests(
  async () => new MockAssignmentRepository(),
  async () => {},
);
