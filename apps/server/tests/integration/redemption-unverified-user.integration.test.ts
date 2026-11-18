import { invitation, member, user } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from './repositories/setup';
import { BetterAuthRedemptionIdentityGateway } from '@/infrastructure/services/better-auth-redemption-identity-gateway';
import { auth, createServerAuth } from '@/main/di/server-auth';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '@/tests/test-support/identity-fixtures';

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

describe('redemption sign-up identity', () => {
  it('lets a newly signed-up, unverified User accept the Church invitation', async () => {
    const gateway = new BetterAuthRedemptionIdentityGateway({
      auth,
      createTransactionAuth: createServerAuth,
    });
    const email = `new-${crypto.randomUUID().slice(0, 8)}@redemption.test`;
    const invitationId = crypto.randomUUID();
    await testDb.insert(invitation).values({
      id: invitationId,
      organizationId: fixture.churchA.id,
      email,
      role: 'member',
      inviterId: fixture.adminA,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });

    const account = await gateway.createAccount({
      email,
      name: 'New Volunteer',
      password: 'correct horse battery staple',
    });
    const [created] = await testDb
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, account.userId));
    expect(created?.emailVerified).toBe(false);

    await gateway.acceptChurchInvitation({
      churchInvitationId: invitationId,
      sessionCookie: account.sessionCookie,
    });

    const memberships = await testDb
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, account.userId),
          eq(member.organizationId, fixture.churchA.id),
        ),
      );
    expect(memberships).toHaveLength(1);
  });
});
