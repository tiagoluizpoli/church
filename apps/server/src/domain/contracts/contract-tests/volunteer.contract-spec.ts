import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId } from '../../entities/church';
import type { MinistryId } from '../../entities/ministry';
import type { RoleId } from '../../entities/role';
import type { UserId, VolunteerId } from '../../entities/volunteer';
import type { VolunteerRepository } from '../infrastructure/volunteer.repository';

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
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should throw NotFoundError when volunteer is not found', async () => {
      await expect(
        repo.getById(
          '11111111-1111-1111-1111-111111111111' as ChurchId,
          'non-existent' as VolunteerId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should find a volunteer by userId', async () => {
      const found = await repo.findByUserId(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '22222222-2222-2222-2222-222222222221' as UserId,
      );
      expect(found).not.toBeNull();
      expect(found?.id).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should return null when volunteer is not found by userId', async () => {
      const found = await repo.findByUserId(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        'non-existent' as UserId,
      );
      expect(found).toBeNull();
    });

    it('should check membership in ministry', async () => {
      const isMember = await repo.hasMembershipInMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
      );
      expect(isMember).toBe(true);

      const isMember2 = await repo.hasMembershipInMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444442' as VolunteerId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
      );
      expect(isMember2).toBe(false);
    });

    it('should check role qualification', async () => {
      const isQualified = await repo.hasRoleQualification(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualified).toBe(true);

      const isQualified2 = await repo.hasRoleQualification(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444442' as VolunteerId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualified2).toBe(false);
    });

    it('should list volunteers by ministry', async () => {
      const list = await repo.listByMinistry(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should list volunteers qualified for a role', async () => {
      const list = await repo.listQualifiedForRole(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('44444444-4444-4444-4444-444444444441');
    });

    it('should update volunteer status', async () => {
      await repo.updateStatus(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        'inactive',
      );
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
      );
      expect(found.status).toBe('inactive');
    });
  });
}
