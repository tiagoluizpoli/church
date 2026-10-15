import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId, EventId, EventTimeBlockId } from '@/domain/branded-ids';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';

export function runEventTimeBlockRepositoryContractTests(
  factory: () => Promise<EventTimeBlockRepository>,
  cleanup: () => Promise<void>,
) {
  describe('EventTimeBlockRepository Contract', () => {
    let repo: EventTimeBlockRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a time slot by ID with nested requirements', async () => {
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
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
          'non-existent' as EventTimeBlockId,
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
