import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { EventId } from '../../entities/event';
import type { RoleId } from '../../entities/role';
import type { TimeSlotId } from '../../entities/time-slot';
import type { TimeSlotRepository } from '../time-slot.repository';

export function runTimeSlotRepositoryContractTests(
  factory: () => Promise<TimeSlotRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('TimeSlotRepository Contract', () => {
    let repo: TimeSlotRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a time slot by ID with nested requirements', async () => {
      const found = await repo.getById(
        'church-1' as ChurchId,
        'slot-1' as TimeSlotId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('slot-1');
      expect(found.requirements.length).toBe(1);
      expect(found.requirements[0].roleId).toBe('role-1');
    });

    it('should throw NotFoundError if time slot is not found by ID', async () => {
      await expect(
        repo.getById('church-1' as ChurchId, 'non-existent' as TimeSlotId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should list time slots by event with nested requirements', async () => {
      const list = await repo.listByEvent(
        'church-1' as ChurchId,
        'event-1' as EventId,
      );
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('slot-1');
      expect(list[0].requirements.length).toBe(1);
    });

    it('should bulk create time slots', async () => {
      const slots = await repo.bulkCreate('church-1' as ChurchId, {
        eventId: 'event-1' as EventId,
        slots: [
          {
            startTime: new Date('2024-06-05T12:00:00Z'),
            endTime: new Date('2024-06-05T14:00:00Z'),
            label: 'Second Service',
            requirements: [
              {
                roleId: 'role-1' as RoleId,
                requiredCount: 2,
              },
            ],
          },
        ],
      });

      expect(slots.length).toBe(1);
      expect(slots[0].id).toBeDefined();
      expect(slots[0].label).toBe('Second Service');
      expect(slots[0].requirements.length).toBe(1);
      expect(slots[0].requirements[0].requiredCount).toBe(2);
    });

    it('should delete time slots by event', async () => {
      await repo.deleteByEvent('church-1' as ChurchId, 'event-1' as EventId);
      const list = await repo.listByEvent(
        'church-1' as ChurchId,
        'event-1' as EventId,
      );
      expect(list.length).toBe(0);
    });
  });
}
