import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../src/schema';
import {
  addChurchMember,
  ChurchIdentityConflictError,
  createChurch,
  ensureChurch,
} from '../src/tenancy';
import { clearDatabase, testDb } from './schema/setup';

const FIRST_CHURCH_ID = 'd0000000-0000-4000-8000-000000000001';
const SECOND_CHURCH_ID = 'd0000000-0000-4000-8000-000000000002';
const USER_ID = 'tenancy-user';

describe('tenancy primitives', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('rejects a pinned id when its slug resolves to a different Church', async () => {
    await createChurch({
      db: testDb,
      id: FIRST_CHURCH_ID,
      name: 'First Church',
      slug: 'first-church',
    });

    await expect(
      ensureChurch({
        db: testDb,
        id: SECOND_CHURCH_ID,
        name: 'Conflicting Church',
        slug: 'first-church',
      }),
    ).rejects.toBeInstanceOf(ChurchIdentityConflictError);
  });

  it('rejects a pinned Church whose stored slug differs from the requested slug', async () => {
    await createChurch({
      db: testDb,
      id: FIRST_CHURCH_ID,
      name: 'First Church',
      slug: 'first-church',
    });

    await expect(
      ensureChurch({
        db: testDb,
        id: FIRST_CHURCH_ID,
        name: 'First Church',
        slug: 'renamed-church',
      }),
    ).rejects.toBeInstanceOf(ChurchIdentityConflictError);
  });

  it('converges an existing Church Membership on the requested access level', async () => {
    await createChurch({
      db: testDb,
      id: FIRST_CHURCH_ID,
      name: 'First Church',
      slug: 'first-church',
    });
    await testDb.insert(schema.user).values({
      id: USER_ID,
      name: 'Tenancy User',
      email: 'tenancy-user@example.com',
    });
    await addChurchMember({
      db: testDb,
      churchId: FIRST_CHURCH_ID,
      userId: USER_ID,
      accessLevel: 'member',
    });

    await addChurchMember({
      db: testDb,
      churchId: FIRST_CHURCH_ID,
      userId: USER_ID,
      accessLevel: 'admin',
    });

    const [membership] = await testDb
      .select()
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, FIRST_CHURCH_ID),
          eq(schema.member.userId, USER_ID),
        ),
      );
    expect(membership?.role).toBe('admin');
  });

  it('rolls back the organization when the extension row cannot be written', async () => {
    await expect(
      createChurch({
        db: testDb,
        id: SECOND_CHURCH_ID,
        name: 'Atomic Church',
        slug: 'atomic-church',
        settings: { nonSerializable: BigInt(1) },
      }),
    ).rejects.toThrow();

    const rows = await testDb
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.slug, 'atomic-church'));
    expect(rows).toHaveLength(0);
  });
});
