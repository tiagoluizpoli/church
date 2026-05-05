import { describe, expect, it } from 'vitest';
import * as schema from '../../src/schema';
import { clearDatabase, testDb } from '../schema/setup';

describe('Performance: Soft Registration (SC-003)', () => {
  it('should complete soft registration in less than 500ms', async () => {
    await clearDatabase();

    const churchId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Setup prerequisites
    await testDb.insert(schema.church).values({
      id: churchId,
      name: 'Perf Church',
      slug: 'perf-church',
    });

    await testDb.insert(schema.user).values({
      id: userId,
      email: 'perf@test.com',
      name: 'Perf User',
    });

    const start = performance.now();

    // The actual soft registration step
    await testDb.insert(schema.volunteer).values({
      userId,
      churchId,
      status: 'active',
    });

    const duration = performance.now() - start;
    console.log(`⏱️ Soft registration took: ${duration.toFixed(2)}ms`);

    expect(duration).toBeLessThan(500);
  });
});
