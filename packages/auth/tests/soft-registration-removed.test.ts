import * as schema from '@church/db/schema';
import { createChurch } from '@church/db/tenancy';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth } from '../src/index';
import { clearDatabase, testDb } from './setup';

describe('registration', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('does not create a Volunteer or Church Membership during sign-up', async () => {
    const church = await createChurch({
      db: testDb,
      name: 'System Church',
      slug: 'system-church',
    });

    const result = await auth.api.signUpEmail({
      body: {
        email: 'new-user@example.com',
        password: 'registration-password',
        name: 'New User',
      },
    });

    const volunteers = await testDb
      .select()
      .from(schema.volunteer)
      .where(eq(schema.volunteer.userId, result.user.id));
    const memberships = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, church.id));

    expect(volunteers).toHaveLength(0);
    expect(memberships).toHaveLength(0);
  });
});
