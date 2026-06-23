import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { MinistryId } from '../../entities/ministry';
import type { RoleId } from '../../entities/role';
import type { RoleRepository } from '../role.repository';

export function runRoleRepositoryContractTests(
  factory: () => Promise<RoleRepository>,
  cleanup: () => Promise<void> = async () => {},
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
        'church-1' as ChurchId,
        'role-1' as RoleId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('role-1');
      expect(found.name).toBe('Usher');
    });

    it('should throw NotFoundError when role is not found', async () => {
      await expect(
        repo.getById('church-1' as ChurchId, 'non-existent' as RoleId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when tenant isolation is breached', async () => {
      await expect(
        repo.getById('church-2' as ChurchId, 'role-1' as RoleId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should list roles in a ministry alphabetically', async () => {
      const list = await repo.listByMinistry(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
      );
      expect(list.length).toBe(2);
      expect(list[0].name).toBe('Greeter');
      expect(list[1].name).toBe('Usher');
    });
  });
}
