import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/index';
import * as schema from '../src/schema';
import { SEED_CONFIG } from '../src/seed/constants';
import { seedDatabase } from '../src/seed/index';
import { truncateAllTables } from '../src/seed/utils';

describe('Local Seeder', () => {
  beforeEach(async () => {
    // Ensure a clean state before each test
    await truncateAllTables();
  });

  describe('T007: Integration - Structure', () => {
    it('generates the correct multi-tenant structure', async () => {
      await seedDatabase();

      const churches = await db.select().from(schema.church);
      expect(churches).toHaveLength(SEED_CONFIG.CHURCH_COUNT);

      for (const church of churches) {
        const ministries = await db
          .select()
          .from(schema.ministry)
          .where(eq(schema.ministry.churchId, church.id));

        expect(ministries.length).toBe(
          SEED_CONFIG.MINISTRIES_PER_CHURCH.length,
        );

        const volunteers = await db
          .select()
          .from(schema.volunteer)
          .where(eq(schema.volunteer.churchId, church.id));

        expect(volunteers).toHaveLength(SEED_CONFIG.VOLUNTEERS_PER_CHURCH);

        // Verify Assignments and Availability
        const assignments = await db
          .select()
          .from(schema.assignment)
          .where(eq(schema.assignment.churchId, church.id));

        expect(assignments.length).toBeGreaterThan(0);

        const availability = await db
          .select()
          .from(schema.availability)
          .where(eq(schema.availability.churchId, church.id));

        expect(availability.length).toBeGreaterThan(0);
      }
    });
  });

  describe('T008: Integration - Determinism', () => {
    it('produces identical records across multiple runs', async () => {
      const getSnapshot = async () => {
        const churches = await db
          .select()
          .from(schema.church)
          .orderBy(schema.church.id);
        const ministries = await db
          .select()
          .from(schema.ministry)
          .orderBy(schema.ministry.id);
        const users = await db
          .select()
          .from(schema.user)
          .orderBy(schema.user.id);
        const assignments = await db
          .select()
          .from(schema.assignment)
          .orderBy(schema.assignment.id);

        return {
          churches,
          ministries: ministries.map(
            ({ createdAt, updatedAt, ...rest }) => rest,
          ),
          users: users.map(({ createdAt, updatedAt, ...rest }) => rest),
          assignments: assignments.map(({ assignedAt, ...rest }) => rest),
        };
      };

      // First run
      faker.seed(SEED_CONFIG.GLOBAL_SEED);
      await seedDatabase();
      const snapshot1 = await getSnapshot();

      // Reset and second run
      await truncateAllTables();
      faker.seed(SEED_CONFIG.GLOBAL_SEED);
      await seedDatabase();
      const snapshot2 = await getSnapshot();

      expect(snapshot1).toEqual(snapshot2);
    });
  });
});
