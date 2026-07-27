import { db } from '@church/db';
import * as schema from '@church/db/schema';
import { findChurchBySlug } from '@church/db/tenancy';
import { and, eq } from 'drizzle-orm';

export async function handleSoftRegistration(userId: string) {
  const systemChurchSlug = 'system-church';

  // 1. Find the System Church — a Church's slug lives on its organization row.
  const church = await findChurchBySlug({ db, slug: systemChurchSlug });

  if (!church) {
    console.warn(
      `[SoftRegistration] System Church not found for slug: ${systemChurchSlug}`,
    );
    return;
  }

  // 2. Check if Volunteer already exists
  const existingVolunteer = await db.query.volunteer.findFirst({
    where: and(
      eq(schema.volunteer.userId, userId),
      eq(schema.volunteer.churchId, church.id),
    ),
  });

  if (existingVolunteer) {
    return;
  }

  // 3. Create Volunteer record
  try {
    console.log(`[SoftRegistration] Creating volunteer for user: ${userId}`);
    await db.insert(schema.volunteer).values({
      userId,
      churchId: church.id,
      status: 'active',
    });
  } catch (error) {
    console.error(
      `[SoftRegistration] Failed to create volunteer for user ${userId}:`,
      error,
    );
  }
}
