import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../branded-ids';
import type { ChurchSlug } from '../../entities/church';
import type { ChurchRepository } from '../infrastructure/church.repository';

export function runChurchRepositoryContractTests(
  factory: () => Promise<ChurchRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('ChurchRepository Contract', () => {
    let repo: ChurchRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a church by ID', async () => {
      // In contract tests, we assume the factory or seed script has populated this ID, or that the repository implementation is mock/in-memory which supports it.
      // Wait, since repository methods are read-only here (they don't have save/create method on the interface), how do we test them?
      // Ah! In contract tests, we can provide a seed function or we can pass pre-seeded data, or the repository implementation's factory can pre-populate it!
      // Yes! The factory function itself can pre-populate the repository with test data, or we can design the test to expect certain data that is seeded by the runner.
      // Let's document this in the contract suite: "The factory MUST return a repository seeded with:
      // - A church with ID '11111111-1111-1111-1111-111111111111' and slug 'first-church'"
      // This is extremely simple and elegant!
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(found.name).toBe('First Church');
    });

    it('should throw NotFoundError when church is not found by ID', async () => {
      await expect(repo.getById('non-existent' as ChurchId)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should retrieve a church by slug', async () => {
      const found = await repo.getBySlug('first-church' as ChurchSlug);
      expect(found).toBeDefined();
      expect(found.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(found.slug).toBe('first-church');
    });

    it('should throw NotFoundError when church is not found by slug', async () => {
      await expect(
        repo.getBySlug('non-existent-slug' as ChurchSlug),
      ).rejects.toThrow(NotFoundError);
    });
  });
}
