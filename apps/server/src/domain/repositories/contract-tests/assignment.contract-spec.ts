import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssignmentId } from '../../entities/assignment';
import type { ChurchId } from '../../entities/church';
import type { EventId } from '../../entities/event';
import type { RoleId } from '../../entities/role';
import type { TimeSlotId } from '../../entities/time-slot';
import type { VolunteerId } from '../../entities/volunteer';
import type { AssignmentRepository } from '../assignment.repository';

export function runAssignmentRepositoryContractTests(
  factory: () => Promise<AssignmentRepository>,
  cleanup: () => Promise<void> = async () => {},
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
      const created = await repo.create(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          slotId: '77777777-7777-7777-7777-777777777772' as TimeSlotId,
          volunteerId: '44444444-4444-4444-4444-444444444442' as VolunteerId,
          roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        },
      );

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.status).toBe('draft');
    });

    it('should retrieve an assignment by ID', async () => {
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '99999999-9999-9999-9999-999999999991' as AssignmentId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('99999999-9999-9999-9999-999999999991');
    });

    it('should throw NotFoundError if assignment is not found by ID', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111111' as ChurchId,
          'non-existent' as AssignmentId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should find assignment by slot and volunteer', async () => {
      const found = await repo.findBySlotAndVolunteer(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '77777777-7777-7777-7777-777777777771' as TimeSlotId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
      );
      expect(found).not.toBeNull();
      // Should return a matching one (e.g. assignment-1 or assignment-2 depending on implementation; but let's assume it finds one)
      expect(found?.volunteerId).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should list assignments by slot', async () => {
      const list = await repo.listBySlot(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '77777777-7777-7777-7777-777777777771' as TimeSlotId,
      );
      // contains assignment-1 and assignment-2
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by event', async () => {
      const list = await repo.listByEvent(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by volunteer', async () => {
      const list = await repo.listByVolunteer(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('should list assignments by volunteers', async () => {
      const list = await repo.listByVolunteers(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        [
          '44444444-4444-4444-4444-444444444441' as VolunteerId,
          '44444444-4444-4444-4444-444444444442' as VolunteerId,
        ],
      );
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
      await repo.updateStatus(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '99999999-9999-9999-9999-999999999991' as AssignmentId,
        {
          status: 'confirmed',
          reason: 'Confirmed by test',
        },
      );

      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '99999999-9999-9999-9999-999999999991' as AssignmentId,
      );
      expect(found.status).toBe('confirmed');
      expect(found.reason).toBe('Confirmed by test');
    });

    it('should count assignments in range', async () => {
      // startTime and endTime of slot-1
      const count = await repo.countByVolunteerInRange(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        new Date('2024-06-01T00:00:00Z'),
        new Date('2024-06-30T23:59:59Z'),
        ['confirmed'],
      );
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should list declined assignments by slot', async () => {
      const list = await repo.listDeclinedBySlot(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '77777777-7777-7777-7777-777777777771' as TimeSlotId,
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('99999999-9999-9999-9999-999999999992');
      expect(list[0]?.status).toBe('declined');
    });

    it('should delete assignments by event', async () => {
      await repo.deleteByEvent(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      const list = await repo.listByEvent(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(list.length).toBe(0);
    });
  });
}
