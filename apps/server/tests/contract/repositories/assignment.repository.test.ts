// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks

import { NotFoundError } from '@church/core';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  RoleId,
  TimeSlotId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { runAssignmentRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/assignment.contract-spec';
import type {
  AssignmentRepository,
  CreateAssignmentInput,
  UpdateAssignmentStatusInput,
} from '../../../src/domain/contracts/infrastructure/assignment.repository';
import {
  Assignment,
  type AssignmentStatus,
} from '../../../src/domain/entities/assignment';

class MockAssignmentRepository implements AssignmentRepository {
  private assignments = new Map<string, Assignment>();
  private idCounter = 1;

  constructor() {
    const a1 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        slotId: '77777777-7777-7777-7777-777777777771' as TimeSlotId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        status: 'confirmed',
      },
      '99999999-9999-9999-9999-999999999991' as AssignmentId,
    );
    const a2 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        slotId: '77777777-7777-7777-7777-777777777771' as TimeSlotId,
        volunteerId: '44444444-4444-4444-4444-444444444442' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        status: 'declined',
        reason: 'Sick',
      },
      '99999999-9999-9999-9999-999999999992' as AssignmentId,
    );
    const a3 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        slotId: '77777777-7777-7777-7777-777777777772' as TimeSlotId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        status: 'confirmed',
      },
      '99999999-9999-9999-9999-999999999993' as AssignmentId,
    );

    this.assignments.set(a1.id, a1);
    this.assignments.set(a2.id, a2);
    this.assignments.set(a3.id, a3);
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
    if (eventId === ('66666666-6666-6666-6666-666666666661' as EventId)) {
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

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
  ): Promise<Assignment[]> {
    const volunteerIdSet = new Set(volunteerIds);
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && volunteerIdSet.has(a.volunteerId),
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
    if (eventId === ('66666666-6666-6666-6666-666666666661' as EventId)) {
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

  async deleteById(churchId: ChurchId, id: AssignmentId): Promise<void> {
    const a = this.assignments.get(id);
    if (a && a.churchId === churchId) {
      this.assignments.delete(id);
    }
  }
}

runAssignmentRepositoryContractTests(
  async () => new MockAssignmentRepository(),
  async () => {},
);
