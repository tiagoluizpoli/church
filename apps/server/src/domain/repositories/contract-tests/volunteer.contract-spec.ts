import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { MinistryId } from '../../entities/ministry';
import type { RoleId } from '../../entities/role';
import type { UserId, VolunteerId } from '../../entities/volunteer';
import type { VolunteerRepository } from '../volunteer.repository';

export function runVolunteerRepositoryContractTests(
  factory: () => Promise<VolunteerRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('VolunteerRepository Contract', () => {
    let repo: VolunteerRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should retrieve a volunteer by ID', async () => {
      const found = await repo.getById(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('volunteer-1');
    });

    it('should throw NotFoundError when volunteer is not found', async () => {
      await expect(
        repo.getById('church-1' as ChurchId, 'non-existent' as VolunteerId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should find a volunteer by userId', async () => {
      const found = await repo.findByUserId(
        'church-1' as ChurchId,
        'user-1' as UserId,
      );
      expect(found).not.toBeNull();
      expect(found?.id).toBe('volunteer-1');
    });

    it('should return null when volunteer is not found by userId', async () => {
      const found = await repo.findByUserId(
        'church-1' as ChurchId,
        'non-existent' as UserId,
      );
      expect(found).toBeNull();
    });

    it('should check membership in ministry', async () => {
      const isMember = await repo.hasMembershipInMinistry(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        'ministry-1' as MinistryId,
      );
      expect(isMember).toBe(true);

      const isMember2 = await repo.hasMembershipInMinistry(
        'church-1' as ChurchId,
        'volunteer-2' as VolunteerId,
        'ministry-1' as MinistryId,
      );
      expect(isMember2).toBe(false);
    });

    it('should check role qualification', async () => {
      const isQualified = await repo.hasRoleQualification(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        'role-1' as RoleId,
      );
      expect(isQualified).toBe(true);

      const isQualified2 = await repo.hasRoleQualification(
        'church-1' as ChurchId,
        'volunteer-2' as VolunteerId,
        'role-1' as RoleId,
      );
      expect(isQualified2).toBe(false);
    });

    it('should list volunteers by ministry', async () => {
      const list = await repo.listByMinistry(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
      );
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('volunteer-1');
    });

    it('should list volunteers qualified for a role', async () => {
      const list = await repo.listQualifiedForRole(
        'church-1' as ChurchId,
        'ministry-1' as MinistryId,
        'role-1' as RoleId,
      );
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('volunteer-1');
    });

    it('should update volunteer status', async () => {
      await repo.updateStatus(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
        'inactive',
      );
      const found = await repo.getById(
        'church-1' as ChurchId,
        'volunteer-1' as VolunteerId,
      );
      expect(found.status).toBe('inactive');
    });
  });
}
