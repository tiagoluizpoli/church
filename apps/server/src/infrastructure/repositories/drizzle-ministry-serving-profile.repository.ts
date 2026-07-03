import { ministryServingProfile } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type {
  ListServingProfileByMinistryInput,
  ListServingProfilesByChurchInput,
  MinistryServingProfileRepository,
  ReplaceServingProfileInput,
} from '../../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { MinistryServingProfile } from '../../domain/entities/ministry-serving-profile';
import { mapMinistryServingProfile } from '../mappers/ministry-serving-profile.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleMinistryServingProfileRepository
  implements MinistryServingProfileRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

  async listByMinistry(
    input: ListServingProfileByMinistryInput,
  ): Promise<MinistryServingProfile[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(ministryServingProfile)
      .where(
        and(
          eq(ministryServingProfile.ministryId, input.ministryId),
          withChurchIsolation(ministryServingProfile, input.churchId),
        ),
      );

    return rows.map(mapMinistryServingProfile);
  }

  async listByChurch(
    input: ListServingProfilesByChurchInput,
  ): Promise<MinistryServingProfile[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(ministryServingProfile)
      .where(withChurchIsolation(ministryServingProfile, input.churchId));

    return rows.map(mapMinistryServingProfile);
  }

  async replaceForMinistry(
    input: ReplaceServingProfileInput,
  ): Promise<MinistryServingProfile[]> {
    const db = getClient(this.db, input.tx);

    await db
      .delete(ministryServingProfile)
      .where(
        and(
          eq(ministryServingProfile.ministryId, input.ministryId),
          withChurchIsolation(ministryServingProfile, input.churchId),
        ),
      );

    if (input.entries.length === 0) {
      return [];
    }

    const rows = await db
      .insert(ministryServingProfile)
      .values(
        input.entries.map((entry) => ({
          churchId: input.churchId,
          ministryId: input.ministryId,
          sourceTemplateBlockId: entry.sourceTemplateBlockId,
          serves: entry.serves,
          shiftSplit: entry.shiftSplit,
          headcounts: entry.headcounts.map((headcount) => ({
            roleId: headcount.roleId as string,
            teamId: headcount.teamId ? (headcount.teamId as string) : undefined,
            count: headcount.count,
          })),
        })),
      )
      .returning();

    return rows.map(mapMinistryServingProfile);
  }
}
