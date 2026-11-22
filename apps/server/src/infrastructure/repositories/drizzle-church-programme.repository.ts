import {
  churchAddress,
  eventTemplate,
  templatePrecedence,
  templateTimeBlock,
} from '@church/db';
import { fromTimeColumn } from '@church/time';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  ChurchProgrammeRepository,
  ListRegularActivitiesInput,
} from '../../domain/contracts/infrastructure/church-programme.repository';
import type { RegularActivity } from '../../domain/entities/regular-activity';
import {
  compareRegularActivities,
  exceptOrdinals,
} from '../../domain/programme-order';
import type { Recurrence } from '../../domain/recurrence';
import { withChurchIsolation } from './helpers';
import { resolvedPlace } from './time-block-place';
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
        templateId: eventTemplate.id,
        recurrence: eventTemplate.recurrence,
        startTime: templateTimeBlock.startTime,
        label: templateTimeBlock.label,
        place: resolvedPlace(templateTimeBlock.place),
        atMainAddress: sql<boolean>`coalesce(${churchAddress.isMain}, false)`,
      })
      .from(templateTimeBlock)
      .innerJoin(
        eventTemplate,
        eq(templateTimeBlock.templateId, eventTemplate.id),
      )
      .leftJoin(
        churchAddress,
        eq(churchAddress.id, templateTimeBlock.placeAddressId),
      )
      .where(
        and(
          eq(templateTimeBlock.isPublic, true),
          withChurchIsolation({ table: eventTemplate, churchId }),
        ),
      )
      // A stable base order; the Recurrence sort key then orders it.
      .orderBy(
        asc(templateTimeBlock.startTime),
        asc(sql`lower(${templateTimeBlock.label})`),
        asc(templateTimeBlock.id),
      );

    const winnersByTemplate = await this.listWinners({ churchId });

    const activities = rows.map((row) => ({
      recurrence: row.recurrence as Recurrence,
      exceptOrdinals: exceptOrdinals({
        recurrence: row.recurrence as Recurrence,
        winners: winnersByTemplate.get(row.templateId) ?? [],
      }),
      startTime: fromTimeColumn({ value: row.startTime }),
      label: row.label,
      place: row.place,
      atMainAddress: row.atMainAddress,
    }));
    // Array.sort is stable, so ties keep the SQL order.
    return activities.sort((left, right) =>
      compareRegularActivities({ left, right }),
    );
  }

  /** Recurrences of the templates that won over each template of the Church. */
  private async listWinners({
    churchId,
  }: ListRegularActivitiesInput): Promise<Map<string, Recurrence[]>> {
    const winner = alias(eventTemplate, 'winner');
    const rows = await this.db
      .select({
        loserId: sql<string>`case when ${templatePrecedence.outcome} = 'a_wins' then ${templatePrecedence.templateBId} else ${templatePrecedence.templateAId} end`,
        recurrence: winner.recurrence,
      })
      .from(templatePrecedence)
      .innerJoin(
        winner,
        sql`${winner.id} = case when ${templatePrecedence.outcome} = 'a_wins' then ${templatePrecedence.templateAId} else ${templatePrecedence.templateBId} end`,
      )
      .where(
        and(
          ne(templatePrecedence.outcome, 'both'),
          withChurchIsolation({ table: templatePrecedence, churchId }),
        ),
      );
    const byLoser = new Map<string, Recurrence[]>();
    for (const { loserId, recurrence } of rows) {
      byLoser.set(loserId, [
        ...(byLoser.get(loserId) ?? []),
        recurrence as Recurrence,
      ]);
    }
    return byLoser;
  }
}
