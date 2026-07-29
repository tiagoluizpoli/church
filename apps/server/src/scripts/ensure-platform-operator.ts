import { type TenancyWriter, user } from '@church/db';
import { eq } from 'drizzle-orm';

const PLATFORM_OPERATOR_EMAIL = 'platform-operator@local.church';
const PLATFORM_OPERATOR_NAME = 'Local Platform Operator';

export interface EnsurePlatformOperatorInput {
  db: TenancyWriter;
}

export interface PlatformOperator {
  id: string;
}

/**
 * Local stand-in for spec 024's "one Platform Operator per environment,
 * seeded at bootstrap" — that bootstrap doesn't exist yet, so seed scripts
 * find-or-create this User themselves to pass as `provisionChurch`'s
 * `operatorUserId`. Deliberately holds no Church Membership.
 */
export async function ensurePlatformOperator({
  db,
}: EnsurePlatformOperatorInput): Promise<PlatformOperator> {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, PLATFORM_OPERATOR_EMAIL),
  });

  if (existing) return existing;

  const [created] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      email: PLATFORM_OPERATOR_EMAIL,
      name: PLATFORM_OPERATOR_NAME,
      emailVerified: true,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create local Platform Operator user.');
  }

  return created;
}
