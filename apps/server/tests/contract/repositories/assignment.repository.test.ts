// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks

import { NotFoundError } from '@church/core';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  EventTimeBlockId,
  RoleId,
  VolunteerId,
} from '@/domain/branded-ids';
import type {
  AssignmentRepository,
  AssignmentsByEventInput,
  AssignmentsByEventTimeBlockInput,
  CountAssignmentsByVolunteerInRangeInput,
  CreateAssignmentRepositoryInput,
  FindAssignmentByEventTimeBlockAndVolunteerInput,
  GetAssignmentInput,
  ListAssignmentsByParticipationInput,
  ListAssignmentsByRangeInput,
  ListAssignmentsByShiftInput,
  ListAssignmentsByVolunteerInput,
  ListAssignmentsByVolunteerInRangeInput,
  ListAssignmentsByVolunteersInput,
  UpdateAssignmentStatusRepositoryInput,
} from '@/domain/contracts/infrastructure/assignment.repository';
import { Assignment } from '@/domain/entities/assignment';
import { runAssignmentRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/assignment.contract-spec';

class MockAssignmentRepository implements AssignmentRepository {
  private assignments = new Map<string, Assignment>();
  private idCounter = 1;

  constructor() {
    const a1 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
        status: 'confirmed',
      },
      '99999999-9999-9999-9999-999999999991' as AssignmentId,
    );
    const a2 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
        volunteerId: '44444444-4444-4444-4444-444444444442' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
        status: 'declined',
        reason: 'Sick',
      },
      '99999999-9999-9999-9999-999999999992' as AssignmentId,
    );
    const a3 = new Assignment(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777772' as EventTimeBlockId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
        status: 'confirmed',
      },
      '99999999-9999-9999-9999-999999999993' as AssignmentId,
    );

    this.assignments.set(a1.id, a1);
    this.assignments.set(a2.id, a2);
    this.assignments.set(a3.id, a3);
  }

  async create({
    churchId,
    input,
  }: CreateAssignmentRepositoryInput): Promise<Assignment> {
    const id = `assignment-gen-${this.idCounter++}` as AssignmentId;
    const a = new Assignment(
      {
        churchId,
        eventTimeBlockId:
          input.eventTimeBlockId ??
          ('77777777-7777-7777-7777-777777777771' as EventTimeBlockId),
        participationId: input.participationId,
        shiftId: input.shiftId,
        volunteerId: input.volunteerId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        shiftRequirementId: input.shiftRequirementId,
        status: input.status ?? 'draft',
        reason: input.reason,
        assignedBy: input.assignedBy,
      },
      id,
    );
    this.assignments.set(a.id, a);
    return a;
  }

  async getById({
    churchId,
    assignmentId: id,
  }: GetAssignmentInput): Promise<Assignment> {
    const a = this.assignments.get(id);
    if (!a || a.churchId !== churchId) {
      throw new NotFoundError('Assignment not found');
    }
    return a;
  }

  async findByEventTimeBlockAndVolunteer({
    churchId,
    eventTimeBlockId,
    volunteerId,
  }: FindAssignmentByEventTimeBlockAndVolunteerInput): Promise<Assignment | null> {
    for (const a of this.assignments.values()) {
      if (
        a.churchId === churchId &&
        a.eventTimeBlockId === eventTimeBlockId &&
        a.volunteerId === volunteerId
      ) {
        return a;
      }
    }
    return null;
  }

  async listByEventTimeBlock({
    churchId,
    eventTimeBlockId,
  }: AssignmentsByEventTimeBlockInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.eventTimeBlockId === eventTimeBlockId,
    );
  }

  async listByEvent({
    churchId,
    eventId,
  }: AssignmentsByEventInput): Promise<Assignment[]> {
    if (eventId === ('66666666-6666-6666-6666-666666666661' as EventId)) {
      return Array.from(this.assignments.values()).filter(
        (a) => a.churchId === churchId,
      );
    }
    return [];
  }

  async listByVolunteer({
    churchId,
    volunteerId,
  }: ListAssignmentsByVolunteerInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
  }

  async listByParticipation({
    churchId,
    participationId,
  }: ListAssignmentsByParticipationInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.participationId === participationId,
    );
  }

  async listByShift({
    churchId,
    shiftId,
  }: ListAssignmentsByShiftInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.shiftId === shiftId,
    );
  }

  async listByVolunteers({
    churchId,
    volunteerIds,
  }: ListAssignmentsByVolunteersInput): Promise<Assignment[]> {
    const volunteerIdSet = new Set(volunteerIds);
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && volunteerIdSet.has(a.volunteerId),
    );
  }

  async listByVolunteerInRange({
    churchId,
    volunteerId,
  }: ListAssignmentsByVolunteerInRangeInput): Promise<Assignment[]> {
    // For mock/test range queries, event-time-block-1 has startTime in June 2024
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
  }

  async listByRange({
    churchId,
  }: ListAssignmentsByRangeInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId,
    );
  }

  async updateStatus({
    churchId,
    assignmentId: id,
    input,
  }: UpdateAssignmentStatusRepositoryInput): Promise<void> {
    const a = await this.getById({ churchId, assignmentId: id });
    const props = (a as any)._props;
    props.status = input.status;
    if (input.reason !== undefined) {
      props.reason = input.reason;
    }
    (a as any)._updatedAt = new Date();
  }

  async countByVolunteerInRange({
    churchId,
    volunteerId,
    statusFilter,
  }: CountAssignmentsByVolunteerInRangeInput): Promise<number> {
    let list = Array.from(this.assignments.values()).filter(
      (a) => a.churchId === churchId && a.volunteerId === volunteerId,
    );
    if (statusFilter) {
      list = list.filter((a) => statusFilter.includes(a.status));
    }
    return list.length;
  }

  async deleteByEvent({ eventId }: AssignmentsByEventInput): Promise<void> {
    if (eventId === ('66666666-6666-6666-6666-666666666661' as EventId)) {
      this.assignments.clear();
    }
  }

  async listDeclinedByEventTimeBlock({
    churchId,
    eventTimeBlockId,
  }: AssignmentsByEventTimeBlockInput): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) =>
        a.churchId === churchId &&
        a.eventTimeBlockId === eventTimeBlockId &&
        a.status === 'declined',
    );
  }

  async deleteById({
    churchId,
    assignmentId: id,
  }: GetAssignmentInput): Promise<void> {
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
