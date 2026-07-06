import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId, MinistryId, RoleId } from '../../branded-ids';
import type { RoleRepository } from '../infrastructure/role.repository';

export function runRoleRepositoryContractTests(
  factory: () => Promise<RoleRepository>,
  cleanup: () => Promise<void>,
) {
  describe('RoleRepository Contract', () => {
    let repo: RoleRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a role by ID', async () => {
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('55555555-5555-5555-5555-555555555551');
      expect(found.name).toBe('Usher');
    });

    it('should throw NotFoundError when role is not found', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111111' as ChurchId,
          'non-existent' as RoleId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when tenant isolation is breached', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111112' as ChurchId,
          '55555555-5555-5555-5555-555555555551' as RoleId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should list roles in a ministry alphabetically', async () => {
      const list = await repo.listByMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
      );
      expect(list.length).toBe(2);
      expect(list[0]?.name).toBe('Greeter');
      expect(list[1]?.name).toBe('Usher');
    });
  });
}
