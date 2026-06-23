import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { MinistryId } from '../../entities/ministry';
import type { MinistryRepository } from '../ministry.repository';

export function runMinistryRepositoryContractTests(
  factory: () => Promise<MinistryRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('MinistryRepository Contract', () => {
    let repo: MinistryRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a ministry by ID', async () => {
      const found = await repo.getById(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('ministry-1');
      expect(found.churchId).toBe('church-1');
    });

    it('should throw NotFoundError when ministry is not found by ID', async () => {
      await expect(
        repo.getById('church-1' as ChurchId, 'non-existent' as MinistryId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when tenant isolation is breached', async () => {
      // ministry-1 belongs to church-1, not church-2
      await expect(
        repo.getById('church-2' as ChurchId, 'ministry-1' as MinistryId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should list ministries in a church alphabetically', async () => {
      const list = await repo.listByChurch('church-1' as ChurchId);
      expect(list.length).toBe(2);
      expect(list[0]!.name).toBe('Adult Ministry');
      expect(list[1]!.name).toBe('Youth Ministry');
    });

    it('should retrieve ministry settings', async () => {
      const settings = await repo.getSettings(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
      );
      expect(settings).toBeDefined();
    });
  });
}
