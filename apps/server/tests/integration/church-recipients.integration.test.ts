import { ministryMembership } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchRecipients } from '@/application/church-recipients';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import {
  DrizzleChurchRepository,
  DrizzleUnitOfWork,
  DrizzleVolunteerRepository,
} from '@/infrastructure/repositories';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  resetSchedulingPhase3Db,
  type SchedulingPhase3Seed,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const recipients = new ChurchRecipients({
  churchRepository: new DrizzleChurchRepository({ db: schedulingTestDb }),
  volunteerRepository: new DrizzleVolunteerRepository({ db: schedulingTestDb }),
});
const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });

let seed: SchedulingPhase3Seed;

beforeEach(async () => {
  await resetSchedulingPhase3Db();
  seed = await seedSchedulingPhase3Base();
});

interface ResolveInput {
  churchId?: string;
  ministryId?: string;
  excludeUserId?: string;
}

function resolve({ churchId, ministryId, excludeUserId }: ResolveInput = {}) {
  return unitOfWork.run((tx) =>
    recipients.ministryLeadersOrAdmins({
      tx,
      churchId: ChurchId.from(churchId ?? seed.churchAId),
      ministryId: MinistryId.from(ministryId ?? seed.ministryAId),
      excludeUserId:
        excludeUserId === undefined ? undefined : UserId.from(excludeUserId),
    }),
  );
}

async function demoteLeaders(): Promise<void> {
  await schedulingTestDb
    .update(ministryMembership)
    .set({ ministryAccessLevel: 'volunteer' })
    .where(eq(ministryMembership.ministryId, seed.ministryAId));
}

async function addAdmin(userId: string): Promise<void> {
  await buildUser({
    db: schedulingTestDb,
    id: userId,
    name: userId,
    email: `${userId}@test.com`,
  });
  await buildChurchMembership({
    db: schedulingTestDb,
    churchId: seed.churchAId,
    userId,
    accessLevel: 'admin',
  });
}

describe('ChurchRecipients.ministryLeadersOrAdmins', () => {
  it('returns the active Ministry leaders, not the ChurchAdmins, when one exists', async () => {
    await addAdmin('second-admin');

    expect(await resolve()).toEqual([
      { userId: seed.adminUserId, churchId: seed.churchAId },
    ]);
  });

  it('falls back to the ChurchAdmins when the Ministry has no active leader', async () => {
    await addAdmin('second-admin');
    await demoteLeaders();

    const result = await resolve();

    expect(result.map((r) => r.userId).sort()).toEqual(
      [seed.adminUserId, 'second-admin'].sort(),
    );
  });

  it('applies the actor exclusion after deciding the fallback', async () => {
    await addAdmin('second-admin');
    await demoteLeaders();

    expect(
      (await resolve({ excludeUserId: seed.adminUserId })).map((r) => r.userId),
    ).toEqual(['second-admin']);
  });

  it('does not fall back to admins when the only leader is the excluded actor', async () => {
    await addAdmin('second-admin');

    expect(await resolve({ excludeUserId: seed.adminUserId })).toEqual([]);
  });

  it('never crosses Churches', async () => {
    expect(
      await resolve({ churchId: seed.churchBId, ministryId: seed.ministryBId }),
    ).toEqual([]);
  });
});
