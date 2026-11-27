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
import { exceptOrdinals } from '../../domain/programme-order';
import type { Recurrence } from '../../domain/recurrence';
import { timeBlocksOverlap } from '../../domain/template-collision';
import type {
  DrizzleChurchProgrammeRepositoryInput,
  WinnerBlock,
} from './drizzle-church-programme.repository.types';
import type { AnyDrizzleDb } from './drizzle-db.types';
import { withChurchIsolation } from './helpers';
import { resolvedPlace } from './time-block-place';

/** Day-of-month activities follow weekday ones; the last day of the month closes the month. */
const LAST_DAY_POSITION = 32;

/**
 * The Programme order (backend owns ordering): weekday activities Sunday
 * onward, then time, weekly before monthly; then day-of-month ones by day,
 * then time. A weekly one sits on its first weekday, a monthly one on its
 * first entry.
 */
function programmeOrder() {
  const { recurrence } = eventTemplate;
  const first = sql`${recurrence}->'entries'->0`;
  const group = sql`case when ${recurrence}->>'kind' = 'weekly' or ${first}->>'kind' = 'nthWeekday' then 0 else 1 end`;
  const position = sql`case
    when ${recurrence}->>'kind' = 'weekly' then (select min(weekday::int) from jsonb_array_elements_text(${recurrence}->'weekdays') as weekday)
    when ${first}->>'kind' = 'nthWeekday' then (${first}->>'weekday')::int
    when ${first}->>'kind' = 'dayOfMonth' then (${first}->>'day')::int
    else ${LAST_DAY_POSITION} end`;
  const monthlyLast = sql`case when ${recurrence}->>'kind' = 'monthly' then 1 else 0 end`;
  return [
    asc(group),
    asc(position),
    asc(templateTimeBlock.startTime),
    asc(monthlyLast),
  ];
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
        endTime: templateTimeBlock.endTime,
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
      .orderBy(
        ...programmeOrder(),
        asc(sql`lower(${templateTimeBlock.label})`),
        asc(templateTimeBlock.id),
      );

    const winnersByTemplate = await this.listWinners({ churchId });

    return rows.map((row) => {
      const recurrence = row.recurrence as Recurrence;
      // Apply drops only the blocks a winner overlaps, so only those say "exceto".
      const winners = (winnersByTemplate.get(row.templateId) ?? [])
        .filter((winner) =>
          timeBlocksOverlap({ left: row, right: winner.block }),
        )
        .map((winner) => winner.recurrence);
      return {
        recurrence,
        exceptOrdinals: exceptOrdinals({ recurrence, winners }),
        startTime: fromTimeColumn({ value: row.startTime }),
        label: row.label,
        place: row.place,
        atMainAddress: row.atMainAddress,
      };
    });
  }

  /** Each block of the templates that won over each template of the Church, with its Recurrence. */
  private async listWinners({
    churchId,
  }: ListRegularActivitiesInput): Promise<Map<string, WinnerBlock[]>> {
    const winner = alias(eventTemplate, 'winner');
    const winnerBlock = alias(templateTimeBlock, 'winner_block');
    const rows = await this.db
      .select({
        loserId: sql<string>`case when ${templatePrecedence.outcome} = 'a_wins' then ${templatePrecedence.templateBId} else ${templatePrecedence.templateAId} end`,
        recurrence: winner.recurrence,
        startTime: winnerBlock.startTime,
        endTime: winnerBlock.endTime,
      })
      .from(templatePrecedence)
      .innerJoin(
        winner,
        sql`${winner.id} = case when ${templatePrecedence.outcome} = 'a_wins' then ${templatePrecedence.templateAId} else ${templatePrecedence.templateBId} end`,
      )
      .innerJoin(winnerBlock, eq(winnerBlock.templateId, winner.id))
      .where(
        and(
          ne(templatePrecedence.outcome, 'both'),
          withChurchIsolation({ table: templatePrecedence, churchId }),
        ),
      );
    const byLoser = new Map<string, WinnerBlock[]>();
    for (const { loserId, recurrence, startTime, endTime } of rows) {
      byLoser.set(loserId, [
        ...(byLoser.get(loserId) ?? []),
        { recurrence: recurrence as Recurrence, block: { startTime, endTime } },
      ]);
    }
    return byLoser;
  }
}
