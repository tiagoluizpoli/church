import { member, user } from '@church/db';
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';

describe('ensurePlatformOperator', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates a User with no Church Membership on first call', async () => {
    const operator = await ensurePlatformOperator({ db: testDb });

    const [row] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, operator.id));
    expect(row?.emailVerified).toBe(true);

    const memberships = await testDb.select({ value: count() }).from(member);
    expect(memberships[0]?.value).toBe(0);
  });

  it('reuses the same operator on a second call instead of creating another', async () => {
    const first = await ensurePlatformOperator({ db: testDb });
    const second = await ensurePlatformOperator({ db: testDb });

    expect(second.id).toBe(first.id);

    const rows = await testDb.select({ value: count() }).from(user);
    expect(rows[0]?.value).toBe(1);
  });
});
