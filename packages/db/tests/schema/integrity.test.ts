import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/schema';
import { clearDatabase, testDb } from './setup';

describe('Relational Integrity', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Volunteer Constraints', () => {
    it('should prevent creating a Volunteer without a Church', async () => {
      const [user] = await testDb
        .insert(schema.user)
        .values({
          id: 'user-id',
          email: 'test@test.com',
          name: 'Test User',
        })
        .returning();

      if (!user) throw new Error('User not created');

      // Using Drizzle's sql fragment to bypass type safety for a specific field
      // while staying within the ORM's insert API.
      try {
        await testDb.insert(schema.volunteer).values({
          userId: user.id,
          churchId: sql`NULL`,
        });
        expect.fail('Should have failed: Volunteer without a Church');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('should prevent creating a Volunteer with a non-existent Church', async () => {
      const [user] = await testDb
        .insert(schema.user)
        .values({
          id: 'user-id',
          email: 'test@test.com',
          name: 'Test User',
        })
        .returning();

      if (!user) throw new Error('User not created');

      try {
        await testDb.insert(schema.volunteer).values({
          userId: user.id,
          churchId: '00000000-0000-0000-0000-000000000000',
        });
        expect.fail('Should have failed: Volunteer with non-existent Church');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('should enforce unique userId constraint for Volunteer', async () => {
      const [church] = await testDb
        .insert(schema.church)
        .values({ name: 'Test Church', slug: 'test' })
        .returning();
      if (!church) throw new Error('Church not created');

      const [user] = await testDb
        .insert(schema.user)
        .values({ id: 'user-1', email: '1@test.com', name: 'User 1' })
        .returning();
      if (!user) throw new Error('User not created');

      await testDb.insert(schema.volunteer).values({
        userId: user.id,
        churchId: church.id,
      });

      // Try to insert same user again
      try {
        await testDb.insert(schema.volunteer).values({
          userId: user.id,
          churchId: church.id,
        });
        expect.fail('Should have failed: Duplicate userId for Volunteer');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });
  });

  describe('Ministry Constraints', () => {
    it('should prevent creating a Ministry without a Church', async () => {
      try {
        await testDb.insert(schema.ministry).values({
          name: 'Test Ministry',
          churchId: sql`NULL`,
        });
        expect.fail('Should have failed: Ministry without a Church');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('should prevent creating a Ministry with a non-existent Church', async () => {
      try {
        await testDb.insert(schema.ministry).values({
          name: 'Test Ministry',
          churchId: '00000000-0000-0000-0000-000000000000',
        });
        expect.fail('Should have failed: Ministry with non-existent Church');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });

    it('should require a name for a Ministry', async () => {
      const [church] = await testDb
        .insert(schema.church)
        .values({ name: 'Test Church', slug: 'test' })
        .returning();
      if (!church) throw new Error('Church not created');

      try {
        await testDb.insert(schema.ministry).values({
          churchId: church.id,
          name: sql`NULL`,
        });
        expect.fail('Should have failed: Ministry without a name');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });
  });

  describe('MinistryVolunteer (Junction) Constraints', () => {
    it('should require all FKs (Church, Volunteer, Ministry)', async () => {
      try {
        await testDb.insert(schema.ministryVolunteer).values({
          churchId: sql`NULL`,
          volunteerId: sql`NULL`,
          ministryId: sql`NULL`,
        });
        expect.fail('Should have failed: MinistryVolunteer without FKs');
      } catch (error) {
        const err = error as Error;
        if (err.name === 'AssertionError') throw err;
        expect(err.message).toBeDefined();
      }
    });
  });
});
