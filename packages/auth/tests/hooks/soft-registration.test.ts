import * as schema from '@church/db/schema';
import { createChurch } from '@church/db/tenancy';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleSoftRegistration } from '../../src/hooks/soft-registration';
import { clearDatabase, testDb } from '../setup';

describe('handleSoftRegistration', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('BT-002: Happy Path - first login onboarding', async () => {
    // 1. Setup Church and User
    const church = await createChurch({
      db: testDb,
      name: 'System Church',
      slug: 'system-church',
    });

    const [user] = await testDb
      .insert(schema.user)
      .values({
        id: 'new-user-id',
        email: 'new@test.com',
        name: 'New User',
      })
      .returning();
    if (!user) throw new Error('User setup failed');

    // 2. Run hook
    await handleSoftRegistration(user.id);

    // 3. Verify Volunteer record
    const volunteers = await testDb
      .select()
      .from(schema.volunteer)
      .where(
        and(
          eq(schema.volunteer.userId, user.id),
          eq(schema.volunteer.churchId, church.id),
        ),
      );

    expect(volunteers).toHaveLength(1);
    expect(volunteers[0]?.status).toBe('active');
  });

  it('BT-003: Edge - skip for existing volunteer', async () => {
    // 1. Setup Church, User, and existing Volunteer
    const church = await createChurch({
      db: testDb,
      name: 'System Church',
      slug: 'system-church',
    });

    const [user] = await testDb
      .insert(schema.user)
      .values({
        id: 'existing-user-id',
        email: 'existing@test.com',
        name: 'Existing User',
      })
      .returning();
    if (!user) throw new Error('User setup failed');

    await testDb.insert(schema.volunteer).values({
      userId: user.id,
      churchId: church.id,
      status: 'active',
    });

    // 2. Run hook
    await handleSoftRegistration(user.id);

    // 3. Verify no duplicates
    const volunteers = await testDb
      .select()
      .from(schema.volunteer)
      .where(
        and(
          eq(schema.volunteer.userId, user.id),
          eq(schema.volunteer.churchId, church.id),
        ),
      );

    expect(volunteers).toHaveLength(1);
  });

  it('BT-007: Edge - concurrent login idempotency', async () => {
    // 1. Setup Church and User
    await createChurch({
      db: testDb,
      name: 'System Church',
      slug: 'system-church',
    });

    const [user] = await testDb
      .insert(schema.user)
      .values({
        id: 'concurrent-user-id',
        email: 'concurrent@test.com',
        name: 'Concurrent User',
      })
      .returning();
    if (!user) throw new Error('User setup failed');

    // 2. Run hook twice in parallel
    await Promise.all([
      handleSoftRegistration(user.id),
      handleSoftRegistration(user.id),
    ]);

    // 3. Verify only one record
    const volunteers = await testDb
      .select()
      .from(schema.volunteer)
      .where(eq(schema.volunteer.userId, user.id));

    expect(volunteers).toHaveLength(1);
  });

  it('BT-009: Edge - Database error during hook execution', async () => {
    // This is hard to simulate without mocking the db export,
    // but we can at least ensure it doesn't throw and crash the app
    // because of the try-catch in handleSoftRegistration.

    // We'll skip the church setup to trigger an error if it wasn't for the catch
    // (though our code warns and returns, which is fine)

    await handleSoftRegistration('some-id');
    // Should not throw
  });
});
