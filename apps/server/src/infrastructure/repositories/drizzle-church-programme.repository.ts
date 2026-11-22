import { eventTemplate, templateTimeBlock } from '@church/db';
import { fromTimeColumn } from '@church/time';
import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  ChurchProgrammeRepository,
  ListRegularActivitiesInput,
} from '../../domain/contracts/infrastructure/church-programme.repository';
import type { RegularActivity } from '../../domain/entities/regular-activity';
import type { Recurrence } from '../../domain/recurrence';
import { withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleChurchProgrammeRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleChurchProgrammeRepository
  implements ChurchProgrammeRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleChurchProgrammeRepositoryInput) {
    this.db = db;
  }

  async listRegularActivities({
    churchId,
  }: ListRegularActivitiesInput): Promise<RegularActivity[]> {
    const rows = await this.db
      .select({
        recurrence: eventTemplate.recurrence,
        startTime: templateTimeBlock.startTime,
        label: templateTimeBlock.label,
        place: templateTimeBlock.place,
      })
      .from(templateTimeBlock)
      .innerJoin(
        eventTemplate,
        eq(templateTimeBlock.templateId, eventTemplate.id),
      )
      .where(
        and(
          eq(templateTimeBlock.isPublic, true),
          withChurchIsolation({ table: eventTemplate, churchId }),
        ),
      )
      .orderBy(
        // shortcut: weekly by first weekday, monthly after; #1025 orders by the Recurrence sort key.
        sql`(${eventTemplate.recurrence}->'weekdays'->>0)::int ASC NULLS LAST`,
        asc(templateTimeBlock.startTime),
        asc(sql`lower(${templateTimeBlock.label})`),
        asc(templateTimeBlock.id),
      );

    return rows.map((row) => ({
      recurrence: row.recurrence as Recurrence,
      startTime: fromTimeColumn({ value: row.startTime }),
      label: row.label,
      place: row.place,
    }));
  }
}
