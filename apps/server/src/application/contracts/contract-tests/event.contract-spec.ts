import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../../domain/entities/church';
import type { EventId } from '../../../domain/entities/event';
import type { MinistryId } from '../../../domain/entities/ministry';
import type { EventRepository } from '../event.repository';

export function runEventRepositoryContractTests(
  factory: () => Promise<EventRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('EventRepository Contract', () => {
    let repo: EventRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve an event by ID', async () => {
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('66666666-6666-6666-6666-666666666661');
      expect(found.title).toBe('Youth Gathering');
    });

    it('should throw NotFoundError if event is not found by ID', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111111' as ChurchId,
          'non-existent' as EventId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should retrieve event with slots', async () => {
      const result = await repo.getWithSlots(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(result).toBeDefined();
      expect(result.event.id).toBe('66666666-6666-6666-6666-666666666661');
      expect(result.slots.length).toBe(1);
      expect(result.slots[0]?.id).toBe('77777777-7777-7777-7777-777777777771');
      expect(result.slots[0]?.requirements.length).toBe(1);
    });

    it('should list events by ministry chronologically ascending', async () => {
      const list = await repo.listByMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
      );
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe('66666666-6666-6666-6666-666666666662'); // June 4
      expect(list[1]?.id).toBe('66666666-6666-6666-6666-666666666661'); // June 5
    });

    it('should filter listed events by status', async () => {
      const list = await repo.listByMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
        'published',
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('66666666-6666-6666-6666-666666666662');
    });

    it('should create an event', async () => {
      const created = await repo.create(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
          title: 'New Event',
          startDate: new Date('2024-06-10T10:00:00Z'),
          endDate: new Date('2024-06-10T12:00:00Z'),
        },
      );
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.title).toBe('New Event');
      expect(created.status).toBe('draft');
    });

    it('should update event status', async () => {
      await repo.updateStatus(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
        {
          status: 'published',
        },
      );
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '66666666-6666-6666-6666-666666666661' as EventId,
      );
      expect(found.status).toBe('published');
    });
  });
}
