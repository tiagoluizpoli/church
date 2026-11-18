import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
} from '@/domain/branded-ids';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';

export function runEventRepositoryContractTests(
  factory: () => Promise<EventRepository>,
  cleanup: () => Promise<void>,
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
      const found = await repo.getById({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      expect(found).toBeDefined();
      expect(found.id).toBe('66666666-6666-6666-6666-666666666661');
      expect(found.title).toBe('Youth Gathering');
    });

    it('should throw NotFoundError if event is not found by ID', async () => {
      await expect(
        repo.getById({
          churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
          eventId: 'non-existent' as EventId,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should retrieve event with event time blocks', async () => {
      const result = await repo.getWithEventTimeBlocks({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      expect(result).toBeDefined();
      expect(result.event.id).toBe('66666666-6666-6666-6666-666666666661');
      expect(result.eventTimeBlocks.length).toBe(1);
      expect(result.eventTimeBlocks[0]?.id).toBe(
        '77777777-7777-7777-7777-777777777771',
      );
      expect(result.eventTimeBlocks[0]?.requirements.length).toBe(1);
    });

    it('should list events by ministry chronologically ascending', async () => {
      const list = await repo.listByMinistry({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
      });
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe('66666666-6666-6666-6666-666666666662'); // June 4
      expect(list[1]?.id).toBe('66666666-6666-6666-6666-666666666661'); // June 5
    });

    it('should filter listed events by status', async () => {
      const list = await repo.listByMinistry({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
        status: 'scheduled',
      });
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('66666666-6666-6666-6666-666666666662');
    });

    it('should create an event', async () => {
      const created = await repo.create({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        input: {
          cycleId: '22222222-2222-2222-2222-222222222231' as CycleId,
          title: 'New Event',
          start: new Date('2024-06-10T10:00:00Z'),
          end: new Date('2024-06-10T12:00:00Z'),
        },
      });
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.title).toBe('New Event');
      expect(created.status).toBe('draft');
    });

    it('should update event status', async () => {
      await repo.updateStatus({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
        input: {
          status: 'scheduled',
        },
      });
      const found = await repo.getById({
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
      });
      expect(found.status).toBe('scheduled');
    });
  });
}
