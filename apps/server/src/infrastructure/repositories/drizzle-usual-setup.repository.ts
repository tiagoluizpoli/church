import { templateTimeBlock, usualSetup } from '@church/db';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import type {
  ListUsualSetupByMinistryInput,
  ListUsualSetupsByChurchInput,
  UpsertUsualSetupBlockInput,
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
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select(getTableColumns(usualSetup))
      .from(usualSetup)
      .innerJoin(
        templateTimeBlock,
        eq(templateTimeBlock.id, usualSetup.sourceTemplateTimeBlockId),
      )
      .where(
        and(
          eq(usualSetup.ministryId, input.ministryId),
          withChurchIsolation({ table: usualSetup, churchId: input.churchId }),
        ),
      )
      .orderBy(
        asc(templateTimeBlock.templateId),
        asc(templateTimeBlock.order),
        asc(usualSetup.id),
      );

    return rows.map(mapUsualSetup);
  }

  async listByChurch(
    input: ListUsualSetupsByChurchInput,
  ): Promise<UsualSetup[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select(getTableColumns(usualSetup))
      .from(usualSetup)
      .innerJoin(
        templateTimeBlock,
        eq(templateTimeBlock.id, usualSetup.sourceTemplateTimeBlockId),
      )
      .where(
        withChurchIsolation({ table: usualSetup, churchId: input.churchId }),
      )
      .orderBy(
        asc(templateTimeBlock.templateId),
        asc(templateTimeBlock.order),
        asc(usualSetup.id),
      );

    return rows.map(mapUsualSetup);
  }

  async upsertBlock({
    churchId,
    ministryId,
    entry,
    tx,
  }: UpsertUsualSetupBlockInput): Promise<UsualSetup> {
    const db = getClient({ db: this.db, tx });
    const values = {
      serves: entry.serves,
      shiftSplit: entry.shiftSplit,
      headcounts: entry.headcounts.map((headcount) => ({
        shiftIndex: headcount.shiftIndex,
        sectorId: headcount.sectorId as string,
        roleId: headcount.roleId as string,
        peopleNeeded: headcount.peopleNeeded,
      })),
    };
    // One statement on the Ministry/block key, so a concurrent save of
    // another block never reads or rewrites this one.
    const [row] = await db
      .insert(usualSetup)
      .values({
        churchId,
        ministryId,
        sourceTemplateTimeBlockId: entry.sourceTemplateTimeBlockId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [usualSetup.ministryId, usualSetup.sourceTemplateTimeBlockId],
        set: values,
      })
      .returning();
    if (!row) throw new Error('Usual setup upsert returned no row');

    return mapUsualSetup(row);
  }
}
