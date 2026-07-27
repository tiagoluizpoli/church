import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

describe('Auth & Session Persistence (SC-001)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should maintain existing session tokens after schema-related operations', async () => {
    // 1. Setup: Create a user and an active session
    const [user] = await testDb
      .insert(schema.user)
      .values({
        id: 'existing-user',
        email: 'existing@test.com',
        name: 'Existing User',
      })
      .returning();
    if (!user) throw new Error('User setup failed');

    const sessionToken = 'secret-session-token';
    const [session] = await testDb
      .insert(schema.session)
      .values({
        id: 'session-id',
        token: sessionToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      })
      .returning();
    if (!session) throw new Error('Session setup failed');

    // 2. Action: Simulate "migration" operations
    const church = await createChurch({
      db: testDb,
      name: 'New Church',
      slug: 'new-church',
    });

    await testDb.insert(schema.volunteer).values({
      userId: user.id,
      churchId: church.id,
      status: 'active',
    });

    // 3. Verification: Ensure session remains intact and valid
    const [persistedSession] = await testDb
      .select()
      .from(schema.session)
      .where(eq(schema.session.id, session.id));

    expect(persistedSession).toBeDefined();
    expect(persistedSession?.token).toBe(sessionToken);
    expect(persistedSession?.userId).toBe(user.id);
    expect(persistedSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should preserve session during cascading deletes of non-auth entities', async () => {
    const church = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-casc',
    });

    const [user] = await testDb
      .insert(schema.user)
      .values({ id: 'u1', email: 'u1@test.com', name: 'U1' })
      .returning();
    if (!user) throw new Error('User setup failed');

    await testDb.insert(schema.session).values({
      id: 's1',
      token: 't1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    });

    await testDb.insert(schema.volunteer).values({
      userId: user.id,
      churchId: church.id,
    });

    // Delete volunteer/church
    await testDb
      .delete(schema.volunteer)
      .where(eq(schema.volunteer.userId, user.id));

    // Session should still exist
    const [session] = await testDb
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, user.id));

    expect(session).toBeDefined();
    expect(session?.token).toBe('t1');
  });
});
