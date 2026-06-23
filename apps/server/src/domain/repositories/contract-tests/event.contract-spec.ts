import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { EventId } from '../../entities/event';
import type { MinistryId } from '../../entities/ministry';
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
        'church-1' as ChurchId,
        'event-1' as EventId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('event-1');
      expect(found.title).toBe('Youth Gathering');
    });

    it('should throw NotFoundError if event is not found by ID', async () => {
      await expect(
        repo.getById('church-1' as ChurchId, 'non-existent' as EventId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should retrieve event with slots', async () => {
      const result = await repo.getWithSlots(
        'church-1' as ChurchId,
        'event-1' as EventId,
      );
      expect(result).toBeDefined();
      expect(result.event.id).toBe('event-1');
      expect(result.slots.length).toBe(1);
      expect(result.slots[0]!.id).toBe('slot-1');
      expect(result.slots[0]!.requirements.length).toBe(1);
    });

    it('should list events by ministry chronologically ascending', async () => {
      const list = await repo.listByMinistry(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
      );
      expect(list.length).toBe(2);
      expect(list[0]!.id).toBe('event-2'); // June 4
      expect(list[1]!.id).toBe('event-1'); // June 5
    });

    it('should filter listed events by status', async () => {
      const list = await repo.listByMinistry(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
        'published',
      );
      expect(list.length).toBe(1);
      expect(list[0]!.id).toBe('event-2');
    });

    it('should create an event', async () => {
      const created = await repo.create('church-1' as ChurchId, {
        ministryId: 'ministry-1' as MinistryId,
        title: 'New Event',
        startDate: new Date('2024-06-10T10:00:00Z'),
        endDate: new Date('2024-06-10T12:00:00Z'),
      });
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.title).toBe('New Event');
      expect(created.status).toBe('draft');
    });

    it('should update event status', async () => {
      await repo.updateStatus('church-1' as ChurchId, 'event-1' as EventId, {
        status: 'published',
      });
      const found = await repo.getById(
        'church-1' as ChurchId,
        'event-1' as EventId,
      );
      expect(found.status).toBe('published');
    });
  });
}
