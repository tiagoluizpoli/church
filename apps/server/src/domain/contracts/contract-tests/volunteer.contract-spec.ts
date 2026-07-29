import { NotFoundError } from '@church/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { VolunteerRepository } from '../infrastructure/volunteer.repository';

export function runVolunteerRepositoryContractTests(
  factory: () => Promise<VolunteerRepository>,
  cleanup: () => Promise<void>,
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

    it('should still retrieve a retired volunteer by ID — history stays attributed to the original Church', async () => {
      const found = await repo.getById(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444443' as VolunteerId,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe('44444444-4444-4444-4444-444444444443');
      expect(found.churchId).toBe('11111111-1111-1111-1111-111111111111');
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

    it('should never return a retired profile from findByUserId', async () => {
      const found = await repo.findByUserId(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '22222222-2222-2222-2222-222222222223' as UserId,
      );
      expect(found).toBeNull();
    });

    it('should never return a retired profile from findByUserIdGlobally', async () => {
      const found = await repo.findByUserIdGlobally(
        '22222222-2222-2222-2222-222222222223' as UserId,
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
        '33333333-3333-3333-3333-333333333331' as MinistryId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualified).toBe(true);

      const isQualified2 = await repo.hasRoleQualification(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444442' as VolunteerId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualified2).toBe(false);
    });

    it('should not let a qualification granted in one ministry satisfy the same role id checked against a different ministry', async () => {
      // volunteer-1 is qualified for role-1 through their ministry-1 (Adult
      // Ministry) membership only — they hold no membership at all in
      // ministry-2 (Youth Ministry). A role id shared across ministries (a
      // global role) must not let that ministry-1 grant leak into a
      // ministry-2 qualification check; the join has to be scoped by
      // ministryId, not just volunteerId + status.
      const isQualifiedInOwnMinistry = await repo.hasRoleQualification(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        '33333333-3333-3333-3333-333333333331' as MinistryId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualifiedInOwnMinistry).toBe(true);

      const isQualifiedInOtherMinistry = await repo.hasRoleQualification(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '44444444-4444-4444-4444-444444444441' as VolunteerId,
        '33333333-3333-3333-3333-333333333332' as MinistryId,
        '55555555-5555-5555-5555-555555555551' as RoleId,
      );
      expect(isQualifiedInOtherMinistry).toBe(false);
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
