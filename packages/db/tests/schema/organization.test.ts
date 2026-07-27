import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { session, user } from '../../src/schema/auth';
import {
  invitation,
  member,
  organization,
} from '../../src/schema/organization';
import { clearDatabase, testDb } from './setup';

interface SeededActor {
  userId: string;
  organizationId: string;
}

async function seedActor(): Promise<SeededActor> {
  const [insertedUser] = await testDb
    .insert(user)
    .values({
      id: 'user-1',
      name: 'Ada Admin',
      email: 'ada@example.com',
    })
    .returning();
  if (!insertedUser) throw new Error('User setup failed');

  const [insertedOrganization] = await testDb
    .insert(organization)
    .values({
      id: 'org-1',
      name: 'Grace Church',
      slug: 'grace-church',
    })
    .returning();
  if (!insertedOrganization) throw new Error('Organization setup failed');

  return {
    userId: insertedUser.id,
    organizationId: insertedOrganization.id,
  };
}

describe('Organization Schema', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('persists an organization and enforces a unique slug', async () => {
    const { organizationId } = await seedActor();

    const [found] = await testDb
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId));

    expect(found?.name).toBe('Grace Church');
    expect(found?.slug).toBe('grace-church');
    expect(found?.logo).toBeNull();
    expect(found?.metadata).toBeNull();
    expect(found?.createdAt).toBeInstanceOf(Date);

    await expect(
      testDb.insert(organization).values({
        id: 'org-2',
        name: 'Other Church',
        slug: 'grace-church',
      }),
    ).rejects.toThrow();
  });

  it('defaults a membership role to member', async () => {
    const { userId, organizationId } = await seedActor();

    const [inserted] = await testDb
      .insert(member)
      .values({ id: 'member-1', organizationId, userId })
      .returning();

    expect(inserted?.role).toBe('member');
  });

  it('stores an admin membership for the first user of an organization', async () => {
    const { userId, organizationId } = await seedActor();

    const [inserted] = await testDb
      .insert(member)
      .values({ id: 'member-1', organizationId, userId, role: 'admin' })
      .returning();

    expect(inserted?.role).toBe('admin');
  });

  it('defaults an invitation status to pending and keeps role optional', async () => {
    const { userId, organizationId } = await seedActor();

    const [inserted] = await testDb
      .insert(invitation)
      .values({
        id: 'invitation-1',
        organizationId,
        email: 'invited@example.com',
        inviterId: userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();

    expect(inserted?.status).toBe('pending');
    expect(inserted?.role).toBeNull();
  });

  it('cascades membership and invitation removal from the organization', async () => {
    const { userId, organizationId } = await seedActor();

    await testDb
      .insert(member)
      .values({ id: 'member-1', organizationId, userId });
    await testDb.insert(invitation).values({
      id: 'invitation-1',
      organizationId,
      email: 'invited@example.com',
      inviterId: userId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await testDb
      .delete(organization)
      .where(eq(organization.id, organizationId));

    expect(await testDb.select().from(member)).toHaveLength(0);
    expect(await testDb.select().from(invitation)).toHaveLength(0);
  });

  it('carries an optional active organization on the session', async () => {
    const { userId, organizationId } = await seedActor();

    const [withoutActive] = await testDb
      .insert(session)
      .values({
        id: 'session-1',
        token: 'token-1',
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        updatedAt: new Date(),
      })
      .returning();

    expect(withoutActive?.activeOrganizationId).toBeNull();

    const [withActive] = await testDb
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.id, 'session-1'))
      .returning();

    expect(withActive?.activeOrganizationId).toBe(organizationId);
  });
});
