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
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '77777777-7777-7777-7777-777777777771' as TimeSlotId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('77777777-7777-7777-7777-777777777771');
      expect(found.requirements.length).toBe(1);
      expect(found.requirements[0]?.roleId).toBe(
        '55555555-5555-5555-5555-555555555551',
      );
    });

    it('should throw NotFoundError if time slot is not found by ID', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111111' as ChurchId,
          'non-existent' as TimeSlotId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should list time slots by event with nested requirements', async () => {
      const list = await repo.listByEvent(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('77777777-7777-7777-7777-777777777771');
      expect(list[0]?.requirements.length).toBe(1);
    });

    it('should bulk create time slots', async () => {
      const slots = await repo.bulkCreate(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          eventId: '66666666-6666-6666-6666-666666666661' as EventId,
          slots: [
            {
              startTime: new Date('2024-06-05T12:00:00Z'),
              endTime: new Date('2024-06-05T14:00:00Z'),
              label: 'Second Service',
              requirements: [
                {
                  roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
                  requiredCount: 2,
                },
              ],
            },
          ],
        },
      );

      expect(slots.length).toBe(1);
      expect(slots[0]?.id).toBeDefined();
      expect(slots[0]?.label).toBe('Second Service');
      expect(slots[0]?.requirements.length).toBe(1);
      expect(slots[0]?.requirements[0]?.requiredCount).toBe(2);
    });

    it('should delete time slots by event', async () => {
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
