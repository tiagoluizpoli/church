import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  EventTimeBlockId,
  ShiftRequirementId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';

export function runAssignmentRepositoryContractTests(
  factory: () => Promise<AssignmentRepository>,
  cleanup: () => Promise<void>,
) {
  describe('AssignmentRepository Contract', () => {
    let repo: AssignmentRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should create an assignment', async () => {
      const created = await repo.create({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        input: {
          eventTimeBlockId:
            '77777777-7777-7777-7777-777777777772' as EventTimeBlockId,
          volunteerId: '44444444-4444-4444-4444-444444444442' as VolunteerId,
          shiftRequirementId:
            '88888888-8888-4888-8888-888888888882' as ShiftRequirementId,
        },
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.status).toBe('draft');
    });

    it('should retrieve an assignment by ID', async () => {
      const found = await repo.getById({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
      });
      expect(found).toBeDefined();
      expect(found.id).toBe('99999999-9999-9999-9999-999999999991');
    });

    it('should throw NotFoundError if assignment is not found by ID', async () => {
      await expect(
        repo.getById({
          churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
          assignmentId: 'non-existent' as AssignmentId,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should find assignment by event time block and volunteer', async () => {
      const found = await repo.findByEventTimeBlockAndVolunteer({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
      });
      expect(found).not.toBeNull();
      // Should return a matching one (e.g. assignment-1 or assignment-2 depending on implementation; but let's assume it finds one)
      expect(found?.volunteerId).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should list assignments by event time block', async () => {
      const list = await repo.listByEventTimeBlock({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
      });
      // contains assignment-1 and assignment-2
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by event', async () => {
      const list = await repo.listByEvent({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by volunteer', async () => {
      const list = await repo.listByVolunteer({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
      });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by volunteers', async () => {
      const list = await repo.listByVolunteers({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        volunteerIds: [
          '44444444-4444-4444-4444-444444444441' as VolunteerId,
          '44444444-4444-4444-4444-444444444442' as VolunteerId,
        ],
      });
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(
        list.some(
          (assignment) =>
            assignment.volunteerId ===
            ('44444444-4444-4444-4444-444444444441' as VolunteerId),
        ),
      ).toBe(true);
      expect(
        list.some(
          (assignment) =>
            assignment.volunteerId ===
            ('44444444-4444-4444-4444-444444444442' as VolunteerId),
        ),
      ).toBe(true);
    });

    it('should update assignment status', async () => {
      await repo.updateStatus({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
        input: {
          status: 'confirmed',
          reason: 'Confirmed by test',
        },
      });

      const found = await repo.getById({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
      });
      expect(found.status).toBe('confirmed');
      expect(found.reason).toBe('Confirmed by test');
    });

    it('should count assignments in range', async () => {
      // startTime and endTime of event-time-block-1
      const count = await repo.countByVolunteerInRange({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        startTime: new Date('2024-06-01T00:00:00Z'),
        endTime: new Date('2024-06-30T23:59:59Z'),
        statusFilter: ['confirmed'],
      });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should list declined assignments by event time block', async () => {
      const list = await repo.listDeclinedByEventTimeBlock({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
      });
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('99999999-9999-9999-9999-999999999992');
      expect(list[0]?.status).toBe('declined');
    });

    it('should delete assignments by event', async () => {
      await repo.deleteByEvent({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      const list = await repo.listByEvent({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      expect(list.length).toBe(0);
    });
  });
}
