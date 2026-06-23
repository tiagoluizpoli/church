import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AvailabilityId } from '../../entities/availability';
import type { ChurchId } from '../../entities/church';
import type { VolunteerId } from '../../entities/volunteer';
import type { AvailabilityRepository } from '../availability.repository';

export function runAvailabilityRepositoryContractTests(
  factory: () => Promise<AvailabilityRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('AvailabilityRepository Contract', () => {
    let repo: AvailabilityRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should list availability entries for a volunteer in range', async () => {
      const list = await repo.listByVolunteerInRange(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('availability-1');
    });

    it('should create an availability entry', async () => {
      const created = await repo.create('church-1' as ChurchId, {
        volunteerId: 'volunteer-1' as VolunteerId,
        type: 'available',
        startTime: new Date('2024-06-02T10:00:00Z'),
        endTime: new Date('2024-06-02T12:00:00Z'),
        isAllDay: false,
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.type).toBe('available');
    });

    it('should update an availability entry', async () => {
      await repo.update(
        'church-1' as ChurchId,
        'availability-1' as AvailabilityId,
        {
          type: 'available',
          reason: 'Updated reason',
        },
      );

      const list = await repo.listByVolunteerInRange(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(1);
      expect(list[0].type).toBe('available');
      expect(list[0].reason).toBe('Updated reason');
    });

    it('should delete an availability entry', async () => {
      await repo.delete(
        'church-1' as ChurchId,
        'availability-1' as AvailabilityId,
      );

      const list = await repo.listByVolunteerInRange(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(0);
    });
  });
}
