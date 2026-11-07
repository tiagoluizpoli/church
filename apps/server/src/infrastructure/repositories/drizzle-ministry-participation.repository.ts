import { NotFoundError } from '@church/core';
import {
  availabilityCheck,
  cycle,
  event,
  ministryMembership,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  shift,
} from '@church/db';
import { nowAsDate } from '@church/time';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  min,
  ne,
  sql,
} from 'drizzle-orm';
import type {
  AddInclusionInput,
  CreateParticipationInput,
  FindAvailabilityRequestedAtInput,
  FindParticipationByMinistryEventInput,
  GetParticipationInput,
  HasCycleStaffingInput,
  ListInclusionsInput,
  ListParticipationsByEventInput,
  ListParticipationsByIdsInput,
  ListParticipationsByMinistryInput,
  ListScheduleSummariesInput,
  ListSchedulesFactsInput,
  LockParticipationInput,
  MinistryParticipationRepository,
  RemoveInclusionInput,
  ScheduleCheckCountRow,
  ScheduleServingStateRow,
  ScheduleSummaryRow,
  TouchParticipationInput,
  UpdateParticipationStateInput,
} from '../../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryParticipation } from '../../domain/entities/ministry-participation';
import { aggregateCyclePrepareStatus } from '../../domain/entities/ministry-participation';
import type { ParticipationEventTimeBlockInclusion } from '../../domain/entities/participation-event-time-block-inclusion';
import {
  mapMinistryParticipation,
  mapParticipationEventTimeBlockInclusion,
} from '../mappers/ministry-participation.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

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
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
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
      .select()
      .from(ministryParticipation)
      .where(and(...conditions));

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
      .select()
      .from(ministryParticipation)
      .where(
        and(
          inArray(ministryParticipation.id, input.participationIds),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
        ),
      );

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
      .orderBy(asc(cycle.startDate));

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
            .groupBy(participationEventTimeBlockInclusion.participationId);

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
      );
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
      .groupBy(ministryMembership.ministryId, availabilityCheck.cycleId);
  }
}
