import { NotFoundError } from '@church/core';
import { invitation, organization, user } from '@church/db';
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ChurchSlugTakenError } from '../../src/domain/errors/church-slug-taken';
import {
  provisionChurch,
  repairChurchInvitation,
} from '../../src/scripts/provision-church';
import { testDb, truncateAll } from '../integration/repositories/setup';

const OPERATOR_USER_ID = 'operator-1';

async function seedOperator(): Promise<void> {
  await testDb.insert(user).values({
    id: OPERATOR_USER_ID,
    name: 'Platform Operator',
    email: 'operator@church.test',
    emailVerified: true,
  });
}

describe('provisionChurch', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedOperator();
  });

  it('creates the organization, Church extension row and first Church Invitation in one call', async () => {
    const result = await provisionChurch({
      db: testDb,
      churchName: 'First Church',
      churchSlug: 'first-church',
      adminEmail: 'admin@first-church.test',
      operatorUserId: OPERATOR_USER_ID,
    });

    expect(result.church.slug).toBe('first-church');
    expect(result.redemptionPath).toBe(
      `/invitations/church/${result.invitationId}`,
    );

    const [invitationRow] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, result.invitationId));

    expect(invitationRow).toMatchObject({
      organizationId: result.church.id,
      email: 'admin@first-church.test',
      role: 'admin',
      status: 'pending',
      inviterId: OPERATOR_USER_ID,
    });
  });

  it('prefixes the printed path with baseUrl but returns a relative path', async () => {
    const result = await provisionChurch({
      db: testDb,
      churchName: 'Based Church',
      churchSlug: 'based-church',
      adminEmail: 'admin@based-church.test',
      operatorUserId: OPERATOR_USER_ID,
      baseUrl: 'https://church.example.com',
    });

    expect(result.redemptionPath).toBe(
      `/invitations/church/${result.invitationId}`,
    );
  });

  it('throws a named domain error on slug collision and leaves no partial Church', async () => {
    await provisionChurch({
      db: testDb,
      churchName: 'Taken Church',
      churchSlug: 'taken-slug',
      adminEmail: 'admin@taken-church.test',
      operatorUserId: OPERATOR_USER_ID,
    });

    await expect(
      provisionChurch({
        db: testDb,
        churchName: 'Impostor Church',
        churchSlug: 'taken-slug',
        adminEmail: 'admin@impostor-church.test',
        operatorUserId: OPERATOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(ChurchSlugTakenError);

    const organizationRows = await testDb
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.slug, 'taken-slug'));
    expect(organizationRows[0]?.value).toBe(1);

    const invitationRows = await testDb
      .select({ value: count() })
      .from(invitation)
      .where(eq(invitation.email, 'admin@impostor-church.test'));
    expect(invitationRows[0]?.value).toBe(0);
  });

  it('rejects a malformed admin email', async () => {
    await expect(
      provisionChurch({
        db: testDb,
        churchName: 'Bad Email Church',
        churchSlug: 'bad-email-church',
        adminEmail: 'not-an-email',
        operatorUserId: OPERATOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(z.ZodError);

    const organizationRows = await testDb
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.slug, 'bad-email-church'));
    expect(organizationRows[0]?.value).toBe(0);
  });

  it('throws NotFoundError for an unknown operator and leaves no partial Church', async () => {
    await expect(
      provisionChurch({
        db: testDb,
        churchName: 'Orphan Church',
        churchSlug: 'orphan-church',
        adminEmail: 'admin@orphan-church.test',
        operatorUserId: 'no-such-operator',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const organizationRows = await testDb
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.slug, 'orphan-church'));
    expect(organizationRows[0]?.value).toBe(0);
  });
});

describe('repairChurchInvitation', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedOperator();
  });

  it('cancels the old invitation and mints a corrected one, leaving the Church untouched', async () => {
    const provisioned = await provisionChurch({
      db: testDb,
      churchName: 'Typo Church',
      churchSlug: 'typo-church',
      adminEmail: 'admni@typo-church.test',
      operatorUserId: OPERATOR_USER_ID,
    });

    const repaired = await repairChurchInvitation({
      db: testDb,
      invitationId: provisioned.invitationId,
      newEmail: 'admin@typo-church.test',
    });

    expect(repaired.invitationId).not.toBe(provisioned.invitationId);
    expect(repaired.redemptionPath).toBe(
      `/invitations/church/${repaired.invitationId}`,
    );

    const [oldInvitation] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, provisioned.invitationId));
    expect(oldInvitation?.status).toBe('canceled');

    const [newInvitation] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, repaired.invitationId));
    expect(newInvitation).toMatchObject({
      organizationId: provisioned.church.id,
      email: 'admin@typo-church.test',
      status: 'pending',
      inviterId: OPERATOR_USER_ID,
    });

    const organizationRows = await testDb
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.id, provisioned.church.id));
    expect(organizationRows[0]?.value).toBe(1);
  });

  it('throws NotFoundError when the invitation does not exist', async () => {
    await expect(
      repairChurchInvitation({
        db: testDb,
        invitationId: 'does-not-exist',
        newEmail: 'admin@nowhere.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the invitation is no longer pending', async () => {
    const provisioned = await provisionChurch({
      db: testDb,
      churchName: 'Already Redeemed Church',
      churchSlug: 'already-redeemed-church',
      adminEmail: 'admin@already-redeemed-church.test',
      operatorUserId: OPERATOR_USER_ID,
    });

    await testDb
      .update(invitation)
      .set({ status: 'accepted' })
      .where(eq(invitation.id, provisioned.invitationId));

    await expect(
      repairChurchInvitation({
        db: testDb,
        invitationId: provisioned.invitationId,
        newEmail: 'admin@already-redeemed-church.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a malformed replacement email', async () => {
    const provisioned = await provisionChurch({
      db: testDb,
      churchName: 'Bad Repair Church',
      churchSlug: 'bad-repair-church',
      adminEmail: 'admni@bad-repair-church.test',
      operatorUserId: OPERATOR_USER_ID,
    });

    await expect(
      repairChurchInvitation({
        db: testDb,
        invitationId: provisioned.invitationId,
        newEmail: 'not-an-email',
      }),
    ).rejects.toBeInstanceOf(z.ZodError);

    const [stillPending] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, provisioned.invitationId));
    expect(stillPending?.status).toBe('pending');
  });
});
