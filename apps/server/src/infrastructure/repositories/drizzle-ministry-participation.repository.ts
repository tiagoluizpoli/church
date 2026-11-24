import { NotFoundError } from '@church/core';
import {
  assignment,
  availabilityCheck,
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryMembership,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  role,
  scheduleLastTold,
  sector,
  shift,
  shiftRequirement,
  swapRequest,
  unavailableShift,
} from '@church/db';
import { fromDate, nowAsDate } from '@church/time';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNull,
  min,
  ne,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import type { ChurchId, CycleId, MinistryId } from '../../domain/branded-ids';
import type {
  AddInclusionInput,
  CountSchedulesByStageInput,
  CreateParticipationInput,
  CycleStaffingRow,
  FindAvailabilityRequestedAtInput,
  FindParticipationByMinistryEventInput,
  GetParticipationInput,
  HasCycleStaffingInput,
  ListCycleStaffingInput,
  ListInclusionsInput,
  ListMinistryStaffingInput,
  ListParticipationsByEventInput,
  ListParticipationsByIdsInput,
  ListParticipationsByMinistryInput,
  ListScheduleLastToldInput,
  ListScheduleRowsInput,
  ListScheduleSummariesInput,
  ListSchedulesFactsInput,
  LockParticipationInput,
  LockScheduleParticipationsInput,
  MinistryParticipationRepository,
  MinistryStaffingRow,
  RemoveInclusionInput,
  SaveScheduleLastToldInput,
  ScheduleCheckCountRow,
  ScheduleCountRow,
  ScheduleLastToldRow,
  ScheduleRowsPage,
  ScheduleServingStateRow,
  ScheduleStageCountRow,
  ScheduleSummaryRow,
  TouchParticipationInput,
  UpdateParticipationStateInput,
} from '../../domain/contracts/infrastructure/ministry-participation.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AssignmentStatus } from '../../domain/entities/assignment';
import type { CycleState } from '../../domain/entities/cycle';
import type { MinistryParticipation } from '../../domain/entities/ministry-participation';
import {
  aggregateCyclePrepareStatus,
  SCHEDULE_STAGE_OPTIONS,
  SCHEDULE_STAGES_FURTHEST_BEHIND_FIRST,
  type ScheduleStage,
} from '../../domain/entities/ministry-participation';
import type { ParticipationEventTimeBlockInclusion } from '../../domain/entities/participation-event-time-block-inclusion';
import { SCHEDULE_LIST_PAST_BUCKET } from '../../domain/schedule-list-cursor';
import { mapCycle } from '../mappers/cycle.mapper';
import { mapMinistry } from '../mappers/ministry.mapper';
import {
  mapMinistryParticipation,
  mapParticipationEventTimeBlockInclusion,
} from '../mappers/ministry-participation.mapper';
import {
  containsPattern,
  getClient,
  isValidUuid,
  withChurchIsolation,
} from './helpers';
import type { AnyDrizzleDb } from './types';

interface ScheduleStagesInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
  ministryId?: MinistryId;
  cycleId?: CycleId;
  cycleStates: CycleState[];
  search?: string;
  tx?: TransactionContext;
}

interface OpenSwapRequestCountsInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
  cycleIds?: CycleId[];
  tx?: TransactionContext;
}

const NOT_SERVING: ScheduleStage = 'not_serving';

/** A serving state's step in the domain's furthest-behind-first table; the lowest step wins. */
const SERVING_STEP = sql`case ${ministryParticipation.state} ${sql.join(
  SCHEDULE_STAGES_FURTHEST_BEHIND_FIRST.map(([state], step) =>
    sql.raw(`when '${state}' then ${step}`),
  ),
  sql` `,
)} end`;

interface StepCaseInput {
  step: SQLWrapper;
  literalOf: (stage: ScheduleStage) => string;
}

/** Maps a Schedule's lowest step to a value of its stage; no step means not serving. */
function caseOfStep({ step, literalOf }: StepCaseInput): SQL {
  return sql`case ${step} ${sql.join(
    SCHEDULE_STAGES_FURTHEST_BEHIND_FIRST.map(([, stage], index) =>
      sql.raw(`when ${index} then ${literalOf(stage)}`),
    ),
    sql` `,
  )} else ${sql.raw(literalOf(NOT_SERVING))} end`;
}

interface AssignmentCountInput {
  statuses: AssignmentStatus[];
}

/** Assignments of one requirement row in the given statuses; correlated, so a grouped query sums it. */
function assignmentCount({ statuses }: AssignmentCountInput): SQL<number> {
  return sql<number>`(select count(*) from ${assignment} where ${assignment.shiftRequirementId} = ${shiftRequirement.id} and ${inArray(assignment.status, statuses)})`;
}

/** A seat counts as filled while an assignment holds it, as the Schedule gap count does. */
const LIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['draft', 'pending'];

/** Requirement headcount and seats held, summed over the grouped rows. */
function staffingTotals() {
  const sum = (value: SQL) =>
    sql<number>`coalesce(sum(${value}), 0)::int`.mapWith(Number);
  return {
    needed: sum(sql`${shiftRequirement.peopleNeeded}`).as('needed'),
    filled: sum(
      sql`least(${shiftRequirement.peopleNeeded}, ${assignmentCount({ statuses: LIVE_ASSIGNMENT_STATUSES })})`,
    ).as('filled'),
  };
}

interface RequirementStaffingScopeInput {
  churchId: ChurchId;
  ministryIds?: MinistryId[];
}

interface ListKey {
  column: SQLWrapper;
  value: unknown;
  descending?: boolean;
}

interface AfterPositionInput {
  /** The list order's keys, most significant first. */
  keys: ListKey[];
}

/** Keyset predicate: rows strictly after the position in the order the keys describe. */
function afterPosition({ keys }: AfterPositionInput): SQL {
  return keys.reduceRight<SQL>(
    (rest, { column, value, descending }) =>
      sql`(${column} ${sql.raw(descending ? '<' : '>')} ${value} or (${column} = ${value} and ${rest}))`,
    sql`false`,
  );
}

interface DrizzleMinistryParticipationRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleMinistryParticipationRepository
  implements MinistryParticipationRepository
{
  constructor({ db }: DrizzleMinistryParticipationRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listScheduleLastTold(
    input: ListScheduleLastToldInput,
  ): Promise<ScheduleLastToldRow[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select()
      .from(scheduleLastTold)
      .where(
        and(
          eq(scheduleLastTold.churchId, input.churchId),
          eq(scheduleLastTold.ministryId, input.ministryId),
          eq(scheduleLastTold.cycleId, input.cycleId),
        ),
      )
      .orderBy(asc(scheduleLastTold.volunteerId));
    return rows.map((row) => ({
      volunteerId: row.volunteerId as ScheduleLastToldRow['volunteerId'],
      assignments: row.assignments as ScheduleLastToldRow['assignments'],
      toldAt: fromDate({ date: row.toldAt }),
    }));
  }

  async saveScheduleLastTold(input: SaveScheduleLastToldInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .insert(scheduleLastTold)
      .values({
        churchId: input.churchId,
        ministryId: input.ministryId,
        cycleId: input.cycleId,
        volunteerId: input.volunteerId,
        assignments: input.assignments,
      })
      .onConflictDoUpdate({
        target: [
          scheduleLastTold.churchId,
          scheduleLastTold.ministryId,
          scheduleLastTold.cycleId,
          scheduleLastTold.volunteerId,
        ],
        set: { assignments: input.assignments, toldAt: nowAsDate() },
      });
  }

  async getById(input: GetParticipationInput): Promise<MinistryParticipation> {
    if (!isValidUuid(input.participationId)) {
      throw new NotFoundError(
        `Participation not found: ${input.participationId}`,
      );
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      );

    if (!row) {
      throw new NotFoundError(
        `Participation not found: ${input.participationId}`,
      );
    }

    return mapMinistryParticipation(row);
  }

  async lockById({
    churchId,
    participationId,
    tx,
  }: LockParticipationInput): Promise<MinistryParticipation> {
    if (!isValidUuid(participationId)) {
      throw new NotFoundError(`Participation not found: ${participationId}`);
    }

    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.id, participationId),
          withChurchIsolation({ table: ministryParticipation, churchId }),
        ),
      )
      .for('no key update');

    if (!row) {
      throw new NotFoundError(`Participation not found: ${participationId}`);
    }

    return mapMinistryParticipation(row);
  }

  async lockSchedule({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: LockScheduleParticipationsInput): Promise<MinistryParticipation[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ participation: ministryParticipation })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({ table: ministryParticipation, churchId }),
          eq(ministryParticipation.ministryId, ministryId),
          eq(event.cycleId, cycleId),
        ),
      )
      .orderBy(asc(ministryParticipation.id))
      .for('no key update', { of: ministryParticipation });

    return rows.map((row) => mapMinistryParticipation(row.participation));
  }

  async findByMinistryEvent(
    input: FindParticipationByMinistryEventInput,
  ): Promise<MinistryParticipation | null> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.ministryId, input.ministryId),
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      )
      .limit(1);

    return row ? mapMinistryParticipation(row) : null;
  }

  async create(
    input: CreateParticipationInput,
  ): Promise<MinistryParticipation> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .insert(ministryParticipation)
      .values({
        churchId: input.churchId,
        ministryId: input.ministryId,
        eventId: input.eventId,
      })
      .returning();

    if (!row) {
      throw new Error('Ministry participation insert failed');
    }

    return mapMinistryParticipation(row);
  }

  async listByEvent(
    input: ListParticipationsByEventInput,
  ): Promise<MinistryParticipation[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select(getTableColumns(ministryParticipation))
      .from(ministryParticipation)
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      )
      .orderBy(
        asc(sql`lower(${ministry.name})`),
        asc(ministry.id),
        asc(ministryParticipation.id),
      );

    return rows.map(mapMinistryParticipation);
  }

  async listByMinistry(
    input: ListParticipationsByMinistryInput,
  ): Promise<MinistryParticipation[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const conditions = [
      eq(ministryParticipation.ministryId, input.ministryId),
      withChurchIsolation({
        table: ministryParticipation,
        churchId: input.churchId,
      }),
    ];

    if (input.state) {
      conditions.push(eq(ministryParticipation.state, input.state));
    }

    const rows = await db
      .select(getTableColumns(ministryParticipation))
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(and(...conditions))
      .orderBy(asc(event.start), asc(ministryParticipation.id));

    return rows.map(mapMinistryParticipation);
  }

  async listByIds(
    input: ListParticipationsByIdsInput,
  ): Promise<MinistryParticipation[]> {
    if (input.participationIds.length === 0) {
      return [];
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select(getTableColumns(ministryParticipation))
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          inArray(ministryParticipation.id, input.participationIds),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      )
      .orderBy(asc(event.start), asc(ministryParticipation.id));

    return rows.map(mapMinistryParticipation);
  }

  async updateState(
    input: UpdateParticipationStateInput,
  ): Promise<MinistryParticipation> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(ministryParticipation)
      .set({
        state: input.state,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(
        `Participation not found: ${input.participationId}`,
      );
    }

    return mapMinistryParticipation(row);
  }

  async hasCycleStaffing({
    churchId,
    cycleId,
    tx,
  }: HasCycleStaffingInput): Promise<boolean> {
    const db = getClient({ db: this.db, tx });
    const participationIds = db
      .select({ id: ministryParticipation.id })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          eq(event.cycleId, cycleId),
          withChurchIsolation({ table: ministryParticipation, churchId }),
        ),
      );
    // Sequential: concurrent queries on one transaction connection warn in pg.
    const checks = [
      () =>
        db
          .select({ id: shift.id })
          .from(shift)
          .where(inArray(shift.participationId, participationIds))
          .limit(1),
      () =>
        db
          .select({ id: participationEventTimeBlockInclusion.id })
          .from(participationEventTimeBlockInclusion)
          .where(
            inArray(
              participationEventTimeBlockInclusion.participationId,
              participationIds,
            ),
          )
          .limit(1),
      () =>
        db
          .select({ id: ministryParticipation.id })
          .from(ministryParticipation)
          .where(
            and(
              inArray(ministryParticipation.id, participationIds),
              ne(ministryParticipation.state, 'preparing'),
            ),
          )
          .limit(1),
      () =>
        db
          .select({ id: availabilityCheck.id })
          .from(availabilityCheck)
          .where(
            and(
              eq(availabilityCheck.cycleId, cycleId),
              withChurchIsolation({ table: availabilityCheck, churchId }),
            ),
          )
          .limit(1),
    ];
    for (const check of checks) {
      if ((await check()).length > 0) return true;
    }
    return false;
  }

  async findAvailabilityRequestedAt({
    churchId,
    cycleId,
    ministryId,
    tx,
  }: FindAvailabilityRequestedAtInput): Promise<Date | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ requestedAt: min(availabilityCheck.createdAt) })
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .where(
        and(
          eq(availabilityCheck.cycleId, cycleId),
          eq(ministryMembership.ministryId, ministryId),
          withChurchIsolation({ table: availabilityCheck, churchId }),
        ),
      );
    return row?.requestedAt ?? null;
  }

  async listInclusions(
    input: ListInclusionsInput,
  ): Promise<ParticipationEventTimeBlockInclusion[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select()
      .from(participationEventTimeBlockInclusion)
      .where(
        and(
          eq(
            participationEventTimeBlockInclusion.participationId,
            input.participationId,
          ),
          withChurchIsolation({
            table: participationEventTimeBlockInclusion,
            churchId: input.churchId,
          }),
        ),
      )
      .orderBy(
        asc(participationEventTimeBlockInclusion.participationId),
        asc(participationEventTimeBlockInclusion.eventTimeBlockId),
      );

    return rows.map(mapParticipationEventTimeBlockInclusion);
  }

  async removeInclusion({
    churchId,
    participationId,
    eventTimeBlockId,
    tx,
  }: RemoveInclusionInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .delete(participationEventTimeBlockInclusion)
      .where(
        and(
          eq(
            participationEventTimeBlockInclusion.participationId,
            participationId,
          ),
          eq(
            participationEventTimeBlockInclusion.eventTimeBlockId,
            eventTimeBlockId,
          ),
          withChurchIsolation({
            table: participationEventTimeBlockInclusion,
            churchId,
          }),
        ),
      );
  }

  async addInclusion(input: AddInclusionInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .insert(participationEventTimeBlockInclusion)
      .values({
        churchId: input.churchId,
        participationId: input.participationId,
        eventTimeBlockId: input.eventTimeBlockId,
      })
      .onConflictDoNothing();
  }

  async touch(input: TouchParticipationInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .update(ministryParticipation)
      .set({ touchedAt: nowAsDate() })
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          isNull(ministryParticipation.touchedAt),
        ),
      );
  }

  async listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryRow[]> {
    const db = getClient({ db: this.db, tx: input.tx });

    const sentCycles = await db
      .select({
        id: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      })
      .from(cycle)
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId: input.churchId }),
          eq(cycle.state, 'sent'),
        ),
      )
      .orderBy(asc(cycle.startDate), asc(cycle.id));

    if (sentCycles.length === 0) {
      return [];
    }

    const cycles = sentCycles;

    if (cycles.length === 0) {
      return [];
    }

    const cycleIds = cycles.map((cycle) => cycle.id);

    // Ministry-scoped participations joined to their cycle, church-isolated
    // on both sides of the join. No fanout risk here (one row per event).
    const participations = await db
      .select({
        id: ministryParticipation.id,
        cycleId: event.cycleId,
        state: ministryParticipation.state,
        touchedAt: ministryParticipation.touchedAt,
      })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          withChurchIsolation({ table: event, churchId: input.churchId }),
          eq(ministryParticipation.ministryId, input.ministryId),
          inArray(event.cycleId, cycleIds),
        ),
      );

    const participationIds = participations.map((row) => row.id);

    // Event time block counts computed as a separate query (not an additional join on
    // the query above) specifically to avoid join fanout inflating the
    // touched/published/requested-or-later counts derived from `participations`.
    const eventTimeBlockCounts =
      participationIds.length === 0
        ? []
        : await db
            .select({
              participationId:
                participationEventTimeBlockInclusion.participationId,
              eventTimeBlockCount: count(),
            })
            .from(participationEventTimeBlockInclusion)
            .where(
              and(
                withChurchIsolation({
                  table: participationEventTimeBlockInclusion,
                  churchId: input.churchId,
                }),
                inArray(
                  participationEventTimeBlockInclusion.participationId,
                  participationIds,
                ),
              ),
            )
            .groupBy(participationEventTimeBlockInclusion.participationId)
            .orderBy(asc(participationEventTimeBlockInclusion.participationId));

    const eventTimeBlockCountByParticipationId = new Map(
      eventTimeBlockCounts.map((row) => [
        row.participationId,
        row.eventTimeBlockCount,
      ]),
    );

    const participationsByCycleId = new Map<string, typeof participations>();
    for (const participation of participations) {
      const list = participationsByCycleId.get(participation.cycleId) ?? [];
      list.push(participation);
      participationsByCycleId.set(participation.cycleId, list);
    }

    return cycles.map((cycle) => {
      const cycleParticipations = participationsByCycleId.get(cycle.id) ?? [];
      const eventCount = cycleParticipations.length;
      const eventTimeBlockCount = cycleParticipations.reduce(
        (sum, participation) =>
          sum +
          (eventTimeBlockCountByParticipationId.get(participation.id) ?? 0),
        0,
      );
      const touchedCount = cycleParticipations.filter(
        (participation) => participation.touchedAt !== null,
      ).length;
      const publishedCount = cycleParticipations.filter(
        (participation) => participation.state === 'published',
      ).length;
      const requestedOrLaterCount = cycleParticipations.filter(
        (participation) => participation.state !== 'preparing',
      ).length;

      const {
        status,
        availabilityRequestedForAll,
        availabilityRequestedForAny,
      } = aggregateCyclePrepareStatus({
        eventCount,
        touchedCount,
        publishedCount,
        requestedOrLaterCount,
      });

      return {
        cycleId: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        isPartOf: eventCount > 0,
        eventCount,
        eventTimeBlockCount,
        status,
        availabilityRequestedForAll,
        availabilityRequestedForAny,
      };
    });
  }

  async listScheduleRows({
    stage,
    attention,
    after,
    limit,
    ...scope
  }: ListScheduleRowsInput): Promise<ScheduleRowsPage> {
    if (scope.ministryIds?.length === 0 || scope.cycleStates.length === 0) {
      return { rows: [] };
    }
    const schedules = this.scheduleStages(scope);
    const nameKey = sql<string>`lower(${ministry.name})`;
    const rows = await getClient({ db: this.db, tx: scope.tx })
      .select({
        ministry,
        cycle,
        stage: schedules.stage,
        bucket: schedules.bucket,
        nameKey,
      })
      .from(schedules)
      .innerJoin(ministry, eq(ministry.id, schedules.ministryId))
      .innerJoin(cycle, eq(cycle.id, schedules.cycleId))
      .where(
        and(
          stage ? eq(schedules.stage, stage) : undefined,
          attention
            ? and(
                ne(cycle.state, 'past'),
                ne(schedules.stage, NOT_SERVING),
                or(
                  ne(schedules.stage, 'published'),
                  gt(schedules.openSwapRequests, 0),
                ),
              )
            : undefined,
          after
            ? afterPosition({
                keys: [
                  { column: schedules.bucket, value: after.bucket },
                  {
                    column: cycle.startDate,
                    value: sql`${after.startDate}::date`,
                    descending: true,
                  },
                  {
                    column: cycle.endDate,
                    value: sql`${after.endDate}::date`,
                    descending: true,
                  },
                  { column: cycle.id, value: after.cycleId },
                  { column: nameKey, value: after.ministryNameKey },
                  { column: ministry.id, value: after.ministryId },
                ],
              })
            : undefined,
        ),
      )
      .orderBy(
        asc(schedules.bucket),
        desc(cycle.startDate),
        desc(cycle.endDate),
        asc(cycle.id),
        asc(nameKey),
        asc(ministry.id),
      )
      .limit(limit + 1);
    const page = rows.slice(0, limit).map((row) => ({
      ministry: mapMinistry(row.ministry),
      cycle: mapCycle(row.cycle),
      stage: row.stage,
      bucket: row.bucket,
      nameKey: row.nameKey,
    }));
    const last = page.at(-1);
    return {
      rows: page.map(({ ministry, cycle, stage }) => ({
        ministry,
        cycle,
        stage,
      })),
      next:
        last && rows.length > limit
          ? {
              bucket: last.bucket,
              startDate: last.cycle.startDate,
              endDate: last.cycle.endDate,
              cycleId: last.cycle.id,
              ministryNameKey: last.nameKey,
              ministryId: last.ministry.id,
            }
          : undefined,
    };
  }

  async countCurrentSchedulesByStage({
    churchId,
    ministryIds,
    tx,
  }: CountSchedulesByStageInput): Promise<ScheduleStageCountRow[]> {
    if (ministryIds?.length === 0) return [];
    const schedules = this.scheduleStages({
      churchId,
      ministryIds,
      cycleStates: ['sent'],
      tx,
    });
    return getClient({ db: this.db, tx })
      .select({ stage: schedules.stage, count: sql<number>`count(*)::int` })
      .from(schedules)
      .groupBy(schedules.stage)
      .orderBy(asc(schedules.stage));
  }

  /**
   * Every active Ministry × Cycle pair in scope with its stage, list bucket and open Swap requests.
   * The stage is the furthest-behind state serving a block, read from the domain's own table.
   */
  private scheduleStages({
    churchId,
    ministryIds,
    ministryId,
    cycleId,
    cycleStates,
    search,
    tx,
  }: ScheduleStagesInput) {
    const client = getClient({ db: this.db, tx });
    const serving = client
      .select({
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
        step: sql<number>`min(${SERVING_STEP})`.as('step'),
      })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({ table: ministryParticipation, churchId }),
          withChurchIsolation({ table: event, churchId }),
          ne(event.status, 'cancelled'),
          ministryIds
            ? inArray(ministryParticipation.ministryId, ministryIds)
            : undefined,
          exists(
            client
              .select({ one: sql`1` })
              .from(participationEventTimeBlockInclusion)
              .where(
                and(
                  withChurchIsolation({
                    table: participationEventTimeBlockInclusion,
                    churchId,
                  }),
                  eq(
                    participationEventTimeBlockInclusion.participationId,
                    ministryParticipation.id,
                  ),
                ),
              ),
          ),
        ),
      )
      .groupBy(ministryParticipation.ministryId, event.cycleId)
      .as('serving');
    const swaps = this.openSwapRequestCounts({ churchId, ministryIds, tx }).as(
      'swaps',
    );
    const pattern = search && containsPattern({ value: search });
    return client
      .select({
        ministryId: sql<string>`${ministry.id}`.as('schedule_ministry_id'),
        cycleId: sql<string>`${cycle.id}`.as('schedule_cycle_id'),
        stage: sql<ScheduleStage>`${caseOfStep({
          step: serving.step,
          literalOf: (stage) => `'${stage}'`,
        })}`.as('stage'),
        // Current Schedules sort by stage rank; Past ones share the bucket after them.
        bucket: sql<number>`case when ${cycle.state} = 'past' then ${sql.raw(
          String(SCHEDULE_LIST_PAST_BUCKET),
        )} else ${caseOfStep({
          step: serving.step,
          literalOf: (stage) => String(SCHEDULE_STAGE_OPTIONS.indexOf(stage)),
        })} end`.as('bucket'),
        openSwapRequests: sql<number>`coalesce(${swaps.count}, 0)`.as(
          'open_swap_requests',
        ),
      })
      .from(ministry)
      .innerJoin(cycle, eq(cycle.churchId, ministry.churchId))
      .leftJoin(
        serving,
        and(eq(serving.ministryId, ministry.id), eq(serving.cycleId, cycle.id)),
      )
      .leftJoin(
        swaps,
        and(eq(swaps.ministryId, ministry.id), eq(swaps.cycleId, cycle.id)),
      )
      .where(
        and(
          withChurchIsolation({ table: ministry, churchId }),
          withChurchIsolation({ table: cycle, churchId }),
          isNull(ministry.deletedAt),
          ministryIds ? inArray(ministry.id, ministryIds) : undefined,
          ministryId ? eq(ministry.id, ministryId) : undefined,
          cycleId ? eq(cycle.id, cycleId) : undefined,
          inArray(cycle.state, cycleStates),
          pattern
            ? or(ilike(ministry.name, pattern), ilike(cycle.name, pattern))
            : undefined,
        ),
      )
      .as('schedules');
  }

  async listScheduleServingStates({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: ListSchedulesFactsInput): Promise<ScheduleServingStateRow[]> {
    return getClient({ db: this.db, tx })
      .selectDistinct({
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
        state: ministryParticipation.state,
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
      .where(
        and(
          withChurchIsolation({ table: ministryParticipation, churchId }),
          withChurchIsolation({ table: event, churchId }),
          withChurchIsolation({
            table: participationEventTimeBlockInclusion,
            churchId,
          }),
          inArray(ministryParticipation.ministryId, ministryIds),
          inArray(event.cycleId, cycleIds),
          ne(event.status, 'cancelled'),
        ),
      )
      .orderBy(
        asc(ministryParticipation.ministryId),
        asc(event.cycleId),
        asc(ministryParticipation.state),
      );
  }

  async countScheduleLateMarks({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: ListSchedulesFactsInput): Promise<ScheduleCountRow[]> {
    return getClient({ db: this.db, tx })
      .select({
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
        count: count(),
      })
      .from(assignment)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, assignment.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(
        unavailableShift,
        eq(unavailableShift.shiftId, assignment.shiftId),
      )
      .innerJoin(
        availabilityCheck,
        eq(availabilityCheck.id, unavailableShift.availabilityCheckId),
      )
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          eq(ministryMembership.volunteerId, assignment.volunteerId),
          eq(ministryMembership.ministryId, ministryParticipation.ministryId),
          eq(availabilityCheck.cycleId, event.cycleId),
          isNull(availabilityCheck.withdrawnAt),
          eq(ministryMembership.status, 'active'),
          gt(unavailableShift.createdAt, assignment.assignedAt),
          inArray(assignment.status, ['draft', 'pending']),
          inArray(ministryParticipation.ministryId, ministryIds),
          inArray(event.cycleId, cycleIds),
        ),
      )
      .groupBy(ministryParticipation.ministryId, event.cycleId)
      .orderBy(asc(ministryParticipation.ministryId), asc(event.cycleId));
  }

  async countScheduleOpenSwapRequests({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: ListSchedulesFactsInput): Promise<ScheduleCountRow[]> {
    return this.openSwapRequestCounts({
      churchId,
      ministryIds,
      cycleIds,
      tx,
    }).orderBy(asc(ministryParticipation.ministryId), asc(event.cycleId));
  }

  private openSwapRequestCounts({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: OpenSwapRequestCountsInput) {
    return getClient({ db: this.db, tx })
      .select({
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
        count: sql<number>`count(*)::int`.as('open_swap_request_count'),
      })
      .from(swapRequest)
      .innerJoin(assignment, eq(assignment.id, swapRequest.assignmentId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, assignment.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          // Same predicate as the leader list's open count (not derived-expired).
          eq(swapRequest.status, 'open'),
          gt(shift.startTime, nowAsDate()),
          ministryIds
            ? inArray(ministryParticipation.ministryId, ministryIds)
            : undefined,
          cycleIds ? inArray(event.cycleId, cycleIds) : undefined,
        ),
      )
      .groupBy(ministryParticipation.ministryId, event.cycleId);
  }

  async countScheduleGaps({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: ListSchedulesFactsInput): Promise<ScheduleCountRow[]> {
    // Per-requirement shortfall via a correlated count: one batched query, no fan-out.
    const assigned = sql<number>`(select count(*) from ${assignment} where ${assignment.shiftRequirementId} = ${shiftRequirement.id} and ${assignment.status} in ('draft', 'pending'))`;
    return getClient({ db: this.db, tx })
      .select({
        ministryId: ministryParticipation.ministryId,
        cycleId: event.cycleId,
        count:
          sql<number>`coalesce(sum(greatest(${shiftRequirement.peopleNeeded} - ${assigned}, 0)), 0)`.mapWith(
            Number,
          ),
      })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .innerJoin(role, eq(role.id, shiftRequirement.roleId))
      .where(
        and(
          withChurchIsolation({ table: shiftRequirement, churchId }),
          eq(eventTimeBlock.status, 'active'),
          ne(event.status, 'cancelled'),
          gt(shift.startTime, nowAsDate()),
          isNull(sector.archivedAt),
          isNull(role.archivedAt),
          inArray(ministryParticipation.ministryId, ministryIds),
          inArray(event.cycleId, cycleIds),
        ),
      )
      .groupBy(ministryParticipation.ministryId, event.cycleId)
      .orderBy(asc(ministryParticipation.ministryId), asc(event.cycleId));
  }

  async countScheduleChecks({
    churchId,
    ministryIds,
    cycleIds,
    tx,
  }: ListSchedulesFactsInput): Promise<ScheduleCheckCountRow[]> {
    return getClient({ db: this.db, tx })
      .select({
        ministryId: ministryMembership.ministryId,
        cycleId: availabilityCheck.cycleId,
        confirmed:
          sql<number>`count(*) filter (where ${availabilityCheck.state} = 'confirmed')`.mapWith(
            Number,
          ),
        asked: count(),
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .where(
        and(
          withChurchIsolation({ table: availabilityCheck, churchId }),
          withChurchIsolation({ table: ministryMembership, churchId }),
          inArray(ministryMembership.ministryId, ministryIds),
          inArray(availabilityCheck.cycleId, cycleIds),
          eq(ministryMembership.status, 'active'),
          isNull(availabilityCheck.withdrawnAt),
        ),
      )
      .groupBy(ministryMembership.ministryId, availabilityCheck.cycleId)
      .orderBy(
        asc(ministryMembership.ministryId),
        asc(availabilityCheck.cycleId),
      );
  }

  async listCycleStaffing({
    churchId,
    ministryIds,
    cycleLimit,
    tx,
  }: ListCycleStaffingInput): Promise<CycleStaffingRow[]> {
    if (ministryIds?.length === 0) return [];
    const client = getClient({ db: this.db, tx });
    const recent = await client
      .select({ id: cycle.id })
      .from(cycle)
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId }),
          inArray(cycle.state, ['sent', 'past']),
        ),
      )
      .orderBy(desc(cycle.startDate), desc(cycle.id))
      .limit(cycleLimit);
    if (recent.length === 0) return [];
    const cycleIds = recent.map(({ id }) => id);
    const staffing = client
      .select({ cycleId: event.cycleId, ...staffingTotals() })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .innerJoin(role, eq(role.id, shiftRequirement.roleId))
      .where(
        and(
          this.requirementStaffingScope({ churchId, ministryIds }),
          inArray(event.cycleId, cycleIds),
        ),
      )
      .groupBy(event.cycleId)
      .as('staffing');
    const checks = client
      .select({
        cycleId: availabilityCheck.cycleId,
        asked: sql<number>`count(*)::int`.as('asked'),
        answered:
          sql<number>`(count(*) filter (where ${availabilityCheck.state} = 'confirmed'))::int`.as(
            'answered',
          ),
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          withChurchIsolation({ table: availabilityCheck, churchId }),
          withChurchIsolation({ table: ministryMembership, churchId }),
          eq(ministryMembership.status, 'active'),
          isNull(availabilityCheck.withdrawnAt),
          isNull(ministry.deletedAt),
          ministryIds
            ? inArray(ministryMembership.ministryId, ministryIds)
            : undefined,
          inArray(availabilityCheck.cycleId, cycleIds),
        ),
      )
      .groupBy(availabilityCheck.cycleId)
      .as('checks');
    const total = (value: SQLWrapper) =>
      sql<number>`coalesce(${value}, 0)`.mapWith(Number);
    return client
      .select({
        cycleId: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        needed: total(staffing.needed),
        filled: total(staffing.filled),
        asked: total(checks.asked),
        answered: total(checks.answered),
      })
      .from(cycle)
      .leftJoin(staffing, eq(staffing.cycleId, cycle.id))
      .leftJoin(checks, eq(checks.cycleId, cycle.id))
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId }),
          inArray(cycle.id, cycleIds),
        ),
      )
      .orderBy(asc(cycle.startDate), asc(cycle.id));
  }

  async listMinistryStaffing({
    churchId,
    ministryIds,
    cycleId,
    tx,
  }: ListMinistryStaffingInput): Promise<MinistryStaffingRow[]> {
    if (ministryIds?.length === 0) return [];
    return getClient({ db: this.db, tx })
      .select({
        ministryId: ministry.id,
        name: ministry.name,
        ...staffingTotals(),
      })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .innerJoin(role, eq(role.id, shiftRequirement.roleId))
      .where(
        and(
          this.requirementStaffingScope({ churchId, ministryIds }),
          eq(event.cycleId, cycleId),
        ),
      )
      .groupBy(ministry.id, ministry.name)
      .orderBy(
        sql`sum(least(${shiftRequirement.peopleNeeded}, ${assignmentCount({ statuses: LIVE_ASSIGNMENT_STATUSES })}))::float / nullif(sum(${shiftRequirement.peopleNeeded}), 0) asc nulls last`,
        asc(ministry.name),
        asc(ministry.id),
      );
  }

  /** Active blocks of Events not cancelled, in live Ministries, Sectors and Roles. */
  private requirementStaffingScope({
    churchId,
    ministryIds,
  }: RequirementStaffingScopeInput): SQL | undefined {
    return and(
      withChurchIsolation({ table: shiftRequirement, churchId }),
      eq(eventTimeBlock.status, 'active'),
      ne(event.status, 'cancelled'),
      isNull(ministry.deletedAt),
      isNull(sector.archivedAt),
      isNull(role.archivedAt),
      ministryIds
        ? inArray(ministryParticipation.ministryId, ministryIds)
        : undefined,
    );
  }
}
