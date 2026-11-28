import {
  assignment,
  church,
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  role,
  sector,
  shift,
  shiftRequirement,
  user,
  volunteer,
} from '@church/db';
import { fromDateColumn } from '@church/time';
import { and, asc, desc, eq, exists, ne, type SQL, sql } from 'drizzle-orm';
import type {
  ScheduleExportCycleRow,
  ScheduleExportCyclesInput,
  ScheduleExportFacts,
  ScheduleExportRepository,
  ScheduleExportRow,
  ScheduleExportRowsInput,
  ScheduleExportScopeInput,
} from '../../domain/contracts/infrastructure/schedule-export.repository';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type { DrizzleScheduleExportRepositoryInput } from './drizzle-schedule-export.repository.types';
import {
  containsPattern,
  getClient,
  isValidUuid,
  withChurchIsolation,
} from './helpers';
import { shownEventTimeBlock } from './live-event-time-block';

const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const PLAIN = 'aaaaaeeeeiiiiooooouuuucn';

/**
 * The export read (#1243): its own queries, not the builder's or the
 * Volunteer's, so cancelled scopes stay and nothing is written.
 */
export class DrizzleScheduleExportRepository
  implements ScheduleExportRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleScheduleExportRepositoryInput) {
    this.db = db;
  }

  async findSchedule(
    input: ScheduleExportScopeInput,
  ): Promise<ScheduleExportFacts | null> {
    if (!isValidUuid(input.ministryId) || !isValidUuid(input.cycleId)) {
      return null;
    }
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select({
        ministryName: ministry.name,
        cycleName: cycle.name,
        cycleStartDate: cycle.startDate,
        cycleEndDate: cycle.endDate,
        timeZone: church.timezone,
        logoKey: church.logoKey,
        published: sql<boolean>`bool_or(${ministryParticipation.state} = 'published')`,
        changedAt:
          sql<Date>`max(greatest(${ministryParticipation.updatedAt}, ${event.updatedAt}))`.mapWith(
            event.updatedAt,
          ),
      })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(cycle, eq(cycle.id, event.cycleId))
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .innerJoin(church, eq(church.id, ministryParticipation.churchId))
      .where(
        and(
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          eq(ministryParticipation.ministryId, input.ministryId),
          eq(event.cycleId, input.cycleId),
        ),
      )
      .groupBy(ministry.id, cycle.id, church.id);
    if (!row) return null;
    return {
      ...row,
      cycleStartDate: fromDateColumn({ date: row.cycleStartDate }),
      cycleEndDate: fromDateColumn({ date: row.cycleEndDate }),
    };
  }

  async listCycles(
    input: ScheduleExportCyclesInput,
  ): Promise<ScheduleExportCycleRow[]> {
    if (!isValidUuid(input.ministryId)) return [];
    const months = sql.join(
      input.monthNames.map((name) => sql`${name}`),
      sql`, `,
    );
    // Lowercase, accents dropped, the same way the words were normalized.
    const haystack = sql`concat_ws(' ',
      translate(lower(${cycle.name}), ${ACCENTED}, ${PLAIN}),
      to_char(${cycle.startDate}, 'DD/MM/YYYY YYYY-MM-DD'),
      to_char(${cycle.endDate}, 'DD/MM/YYYY YYYY-MM-DD'),
      (select string_agg((array[${months}])[extract(month from covered)::int] || ' ' || to_char(covered, 'YYYY MM/YYYY'), ' ')
        from generate_series(date_trunc('month', ${cycle.startDate}), ${cycle.endDate}, interval '1 month') covered))`;
    const matches: SQL[] = input.words.map(
      (word) => sql`${haystack} like ${containsPattern({ value: word })}`,
    );
    const rows = await this.db
      .select({
        id: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        isCurrent: sql<boolean>`(${input.now}::timestamptz at time zone ${church.timezone})::date between ${cycle.startDate} and ${cycle.endDate}`,
      })
      .from(cycle)
      .innerJoin(church, eq(church.id, cycle.churchId))
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
          exists(
            this.db
              .select({ id: ministryParticipation.id })
              .from(ministryParticipation)
              .innerJoin(event, eq(event.id, ministryParticipation.eventId))
              .where(
                and(
                  eq(event.cycleId, cycle.id),
                  eq(ministryParticipation.ministryId, input.ministryId),
                ),
              ),
          ),
          ...matches,
        ),
      )
      .orderBy(desc(cycle.startDate), desc(cycle.id));
    return rows.map((row) => ({
      ...row,
      startDate: fromDateColumn({ date: row.startDate }),
      endDate: fromDateColumn({ date: row.endDate }),
    }));
  }

  async listRows(input: ScheduleExportRowsInput): Promise<ScheduleExportRow[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    return db
      .select({
        eventId: event.id,
        eventTitle: event.title,
        eventStart: event.start,
        eventEnd: event.end,
        eventCancelled: sql<boolean>`${event.status} = 'cancelled'`,
        eventTemplateId: event.sourceTemplateId,
        blockId: eventTimeBlock.id,
        blockLabel: eventTimeBlock.label,
        blockCancelled: sql<boolean>`${eventTimeBlock.status} = 'cancelled'`,
        shiftId: shift.id,
        shiftLabel: shift.label,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        requirementId: shiftRequirement.id,
        sectorId: sector.id,
        sectorName: sector.name,
        roleName: role.name,
        peopleNeeded: shiftRequirement.peopleNeeded,
        volunteerId: volunteer.id,
        volunteerName: user.name,
      })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(
        participationEventTimeBlockInclusion,
        eq(
          participationEventTimeBlockInclusion.participationId,
          ministryParticipation.id,
        ),
      )
      .innerJoin(
        eventTimeBlock,
        eq(
          eventTimeBlock.id,
          participationEventTimeBlockInclusion.eventTimeBlockId,
        ),
      )
      .leftJoin(
        shift,
        and(
          eq(shift.participationId, ministryParticipation.id),
          eq(shift.eventTimeBlockId, eventTimeBlock.id),
        ),
      )
      .leftJoin(shiftRequirement, eq(shiftRequirement.shiftId, shift.id))
      .leftJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .leftJoin(role, eq(role.id, shiftRequirement.roleId))
      .leftJoin(
        assignment,
        and(
          eq(assignment.shiftRequirementId, shiftRequirement.id),
          ne(assignment.status, 'cancelled'),
        ),
      )
      .leftJoin(volunteer, eq(volunteer.id, assignment.volunteerId))
      .leftJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          eq(ministryParticipation.ministryId, input.ministryId),
          eq(event.cycleId, input.cycleId),
          // An Event belongs to the range by its Church-local start day.
          sql`(${event.start} at time zone ${input.timeZone})::date between ${input.from}::date and ${input.to}::date`,
          shownEventTimeBlock(),
        ),
      )
      .orderBy(
        asc(event.start),
        asc(event.id),
        asc(eventTimeBlock.startTime),
        asc(eventTimeBlock.id),
        asc(shift.startTime),
        asc(shift.id),
        asc(sql`lower(${sector.name})`),
        asc(sector.id),
        asc(sql`lower(${role.name})`),
        asc(role.id),
        asc(sql`lower(${user.name})`),
        asc(assignment.id),
      );
  }

  async listSectorIds(input: ScheduleExportScopeInput): Promise<string[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select({ id: sector.id })
      .from(sector)
      .where(
        and(
          withChurchIsolation({ table: sector, churchId: input.churchId }),
          eq(sector.ministryId, input.ministryId),
        ),
      )
      .orderBy(asc(sql`lower(${sector.name})`), asc(sector.id));
    return rows.map((row) => row.id);
  }
}
