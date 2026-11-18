import { beforeEach, describe, expect, it } from 'vitest';
import { user } from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

describe('Simple Test', () => {
  beforeEach(async () => {
    await clearDatabase();
  });
  it('should insert a church', async () => {
    const inserted = await createChurch({
      db: testDb,
      name: 'Simple Church',
      slug: 'simple-church',
    });
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
