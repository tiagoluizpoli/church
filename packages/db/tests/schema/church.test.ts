import { beforeEach, describe, expect, it } from 'vitest';
import { church } from '../../src/schema/church';
import { clearDatabase, testDb } from './setup';

describe('Church Schema', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should create a church with a random UUID', async () => {
    const newChurch = {
      name: 'Test Church',
      slug: 'test-church',
    };

    const [inserted] = await testDb
      .insert(church)
      .values(newChurch)
      .returning();

    if (!inserted) throw new Error('Insert failed');

    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe(newChurch.name);
    expect(inserted.slug).toBe(newChurch.slug);
  });

  it('should enforce unique slug', async () => {
    const church1 = {
      name: 'Church 1',
      slug: 'common-slug',
    };
    const church2 = {
      name: 'Church 2',
      slug: 'common-slug',
    };

    await testDb.insert(church).values(church1);

    try {
      await testDb.insert(church).values(church2);
      expect.fail('Should have thrown unique slug constraint error');
    } catch (error: unknown) {
      if (error.name === 'AssertionError') throw error;
      expect(error.message).toBeDefined();
    }
  });
});
