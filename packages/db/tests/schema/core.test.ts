import { beforeEach, describe, expect, it } from 'vitest';
import { church, ministry, ministryInvitation } from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Core Schema Integration', () => {
  let churchId: string;

  beforeEach(async () => {
    await clearDatabase();
    const [insertedChurch] = await testDb
      .insert(church)
      .values({
        name: 'Test Church',
        slug: 'test-church',
      })
      .returning();
    if (!insertedChurch) throw new Error('Church insert failed');
    churchId = insertedChurch.id;
  });

  it('should enforce church_id foreign key constraint on ministry', async () => {
    const invalidMinistry = {
      name: 'Invalid Ministry',
      churchId: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
    };

    await expect(
      testDb.insert(ministry).values(invalidMinistry),
    ).rejects.toThrow();
  });

  it('should create a valid ministry', async () => {
    const validMinistry = {
      name: 'Worship Ministry',
      churchId,
    };

    const [inserted] = await testDb
      .insert(ministry)
      .values(validMinistry)
      .returning();
    if (!inserted) throw new Error('Ministry insert failed');
    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe(validMinistry.name);
    expect(inserted.churchId).toBe(churchId);
  });

  it('should enforce unique token for ministry invitation', async () => {
    const [insertedMinistry] = await testDb
      .insert(ministry)
      .values({
        name: 'Worship',
        churchId,
      })
      .returning();
    if (!insertedMinistry) throw new Error('Ministry insert failed');

    const invitation1 = {
      churchId,
      ministryId: insertedMinistry.id,
      token: 'common-token',
      type: 'one-time',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    const invitation2 = {
      churchId,
      ministryId: insertedMinistry.id,
      token: 'common-token',
      type: 'one-time',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    await testDb.insert(ministryInvitation).values(invitation1);
    await expect(
      testDb.insert(ministryInvitation).values(invitation2),
    ).rejects.toThrow();
  });
});
