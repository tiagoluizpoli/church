import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AvailabilityId } from '../../../domain/entities/availability';
import type { ChurchId } from '../../../domain/entities/church';
import type { VolunteerId } from '../../../domain/entities/volunteer';
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
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });

    it('should create an availability entry', async () => {
      const created = await repo.create(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
          type: 'available',
          startTime: new Date('2024-06-02T10:00:00Z'),
          endTime: new Date('2024-06-02T12:00:00Z'),
          isAllDay: false,
        },
      );

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.type).toBe('available');
    });

    it('should update an availability entry', async () => {
      await repo.update(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as AvailabilityId,
        {
          type: 'available',
          reason: 'Updated reason',
        },
      );

      const list = await repo.listByVolunteerInRange(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(1);
      expect(list[0]?.type).toBe('available');
      expect(list[0]?.reason).toBe('Updated reason');
    });

    it('should delete an availability entry', async () => {
      await repo.delete(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as AvailabilityId,
      );

      const list = await repo.listByVolunteerInRange(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        new Date('2024-06-01T09:00:00Z'),
        new Date('2024-06-01T13:00:00Z'),
      );
      expect(list.length).toBe(0);
    });
  });
}
