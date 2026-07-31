import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, MinistryId, UserId } from '../../../src/domain/branded-ids';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from './setup';

const { ministryInvitationRepository, manager } =
  createMinistryInvitationTestHarness({ db: testDb });

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

describe('DrizzleMinistryInvitationRepository — worker reads', () => {
  describe('findById', () => {
    it('finds a pending invitation regardless of Ministry, unlike findPendingById', async () => {
      const invitation = await manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.memberNoVolunteerA}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });

      const found = await ministryInvitationRepository.findById({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      });

      expect(found).not.toBeNull();
      expect(found?.id).toBe(invitation.id);
      expect(found?.status).toBe('pending');
    });

    it('returns null for a nonexistent id', async () => {
      const found = await ministryInvitationRepository.findById({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: '00000000-0000-0000-0000-000000000000',
      });
      expect(found).toBeNull();
    });

    it('does not find an invitation scoped to a different Church', async () => {
      const invitation = await manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.memberNoVolunteerA}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });

      const found = await ministryInvitationRepository.findById({
        churchId: ChurchId.from(fixture.churchB.id),
        ministryInvitationId: invitation.id,
      });
      expect(found).toBeNull();
    });
  });

  describe('resolveRecipientEmail', () => {
    it('resolves the existing Church Member account email for an existing-member invitation', async () => {
      const invitation = await manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: `${fixture.memberNoVolunteerA}@fixture.test`,
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });
      const found = await ministryInvitationRepository.findById({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      });
      if (!found) throw new Error('Expected invitation to be found');

      const email = await ministryInvitationRepository.resolveRecipientEmail({
        ministryInvitation: found,
      });

      expect(email).toBe(`${fixture.memberNoVolunteerA}@fixture.test`);
    });

    it('resolves the chained Church Invitation email for an outsider invitation', async () => {
      const invitation = await manager.mint({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryId: MinistryId.from(fixture.ministryOneA),
        inviterId: UserId.from(fixture.adminA),
        email: 'outsider-worker-read@fixture.test',
        ministryAccessLevel: 'volunteer',
        roleIds: [],
      });
      const found = await ministryInvitationRepository.findById({
        churchId: ChurchId.from(fixture.churchA.id),
        ministryInvitationId: invitation.id,
      });
      if (!found) throw new Error('Expected invitation to be found');

      const email = await ministryInvitationRepository.resolveRecipientEmail({
        ministryInvitation: found,
      });

      expect(email).toBe('outsider-worker-read@fixture.test');
    });
  });
});
