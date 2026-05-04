import { beforeEach, describe, expect, it } from 'vitest';
import { church, user } from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Simple Test', () => {
  beforeEach(async () => {
    await clearDatabase();
  });
  it('should insert a church', async () => {
    const [inserted] = await testDb
      .insert(church)
      .values({
        name: 'Simple Church',
        slug: 'simple-church',
      })
      .returning();
    if (!inserted) throw new Error('Insert failed');
    expect(inserted).toBeDefined();
  });

  it('should insert a user', async () => {
    const [inserted] = await testDb
      .insert(user)
      .values({
        id: 'simple_user',
        name: 'Simple User',
        email: 'simple@example.com',
      })
      .returning();
    if (!inserted) throw new Error('Insert failed');
    expect(inserted).toBeDefined();
    expect(inserted.emailVerified).toBe(false);
  });
});
