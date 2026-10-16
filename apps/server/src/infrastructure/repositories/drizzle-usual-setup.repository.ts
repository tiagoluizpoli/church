import { usualSetup } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type {
  ListUsualSetupByMinistryInput,
  ListUsualSetupsByChurchInput,
  ReplaceUsualSetupInput,
  UsualSetupRepository,
} from '../../domain/contracts/infrastructure/usual-setup.repository';
import type { UsualSetup } from '../../domain/entities/usual-setup';
import { mapUsualSetup } from '../mappers/usual-setup.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleUsualSetupRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleUsualSetupRepository implements UsualSetupRepository {
  constructor({ db }: DrizzleUsualSetupRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listByMinistry(
    input: ListUsualSetupByMinistryInput,
  ): Promise<UsualSetup[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(usualSetup)
      .where(
        and(
          eq(usualSetup.ministryId, input.ministryId),
          withChurchIsolation(usualSetup, input.churchId),
        ),
      );

    return rows.map(mapUsualSetup);
  }

  async listByChurch(
    input: ListUsualSetupsByChurchInput,
  ): Promise<UsualSetup[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(usualSetup)
      .where(withChurchIsolation(usualSetup, input.churchId));

    return rows.map(mapUsualSetup);
  }

  async replaceForMinistry(
    input: ReplaceUsualSetupInput,
  ): Promise<UsualSetup[]> {
    const db = getClient(this.db, input.tx);

    await db
      .delete(usualSetup)
      .where(
        and(
          eq(usualSetup.ministryId, input.ministryId),
          withChurchIsolation(usualSetup, input.churchId),
        ),
      );

    if (input.entries.length === 0) {
      return [];
    }

    const rows = await db
      .insert(usualSetup)
      .values(
        input.entries.map((entry) => ({
          churchId: input.churchId,
          ministryId: input.ministryId,
          sourceTemplateTimeBlockId: entry.sourceTemplateTimeBlockId,
          serves: entry.serves,
          shiftSplit: entry.shiftSplit,
          headcounts: entry.headcounts.map((headcount) => ({
            sectorId: headcount.sectorId as string,
            roleId: headcount.roleId as string,
            peopleNeeded: headcount.peopleNeeded,
          })),
        })),
      )
      .returning();

    return rows.map(mapUsualSetup);
  }
}
