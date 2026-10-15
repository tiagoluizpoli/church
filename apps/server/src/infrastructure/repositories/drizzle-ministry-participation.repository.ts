import { NotFoundError } from '@church/core';
import {
  cycle,
  event,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  shiftRequirement,
} from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, count, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type {
  AddInclusionInput,
  CreateParticipationInput,
  FindParticipationByMinistryEventInput,
  GetParticipationInput,
  ListInclusionsInput,
  ListParticipationsByEventInput,
  ListParticipationsByIdsInput,
  ListParticipationsByMinistryInput,
  ListScheduleSummariesInput,
  MinistryParticipationRepository,
  ReplaceInclusionsInput,
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

    const db = getClient(this.db, input.tx);
    const [row] = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation(ministryParticipation, input.churchId),
        ),
      );

    if (!row) {
      throw new NotFoundError(
        `Participation not found: ${input.participationId}`,
      );
    }

    return mapMinistryParticipation(row);
  }

  async findByMinistryEvent(
    input: FindParticipationByMinistryEventInput,
  ): Promise<MinistryParticipation | null> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.ministryId, input.ministryId),
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation(ministryParticipation, input.churchId),
        ),
      )
      .limit(1);

    return row ? mapMinistryParticipation(row) : null;
  }

  async create(
    input: CreateParticipationInput,
  ): Promise<MinistryParticipation> {
    const db = getClient(this.db, input.tx);
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
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation(ministryParticipation, input.churchId),
        ),
      );

    return rows.map(mapMinistryParticipation);
  }

  async listByMinistry(
    input: ListParticipationsByMinistryInput,
  ): Promise<MinistryParticipation[]> {
    const db = getClient(this.db, input.tx);
    const conditions = [
      eq(ministryParticipation.ministryId, input.ministryId),
      withChurchIsolation(ministryParticipation, input.churchId),
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

    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          inArray(ministryParticipation.id, input.participationIds),
          withChurchIsolation(ministryParticipation, input.churchId),
        ),
      );

    return rows.map(mapMinistryParticipation);
  }

  async updateState(
    input: UpdateParticipationStateInput,
  ): Promise<MinistryParticipation> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .update(ministryParticipation)
      .set({
        state: input.state,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation(ministryParticipation, input.churchId),
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

  async listInclusions(
    input: ListInclusionsInput,
  ): Promise<ParticipationEventTimeBlockInclusion[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(participationEventTimeBlockInclusion)
      .where(
        and(
          eq(
            participationEventTimeBlockInclusion.participationId,
            input.participationId,
          ),
          withChurchIsolation(
            participationEventTimeBlockInclusion,
            input.churchId,
          ),
        ),
      );

    return rows.map(mapParticipationEventTimeBlockInclusion);
  }

  async replaceInclusions(input: ReplaceInclusionsInput): Promise<void> {
    const db = getClient(this.db, input.tx);

    if (input.eventTimeBlockIds.length === 0) {
      await db
        .delete(participationEventTimeBlockInclusion)
        .where(
          and(
            eq(
              participationEventTimeBlockInclusion.participationId,
              input.participationId,
            ),
            withChurchIsolation(
              participationEventTimeBlockInclusion,
              input.churchId,
            ),
          ),
        );
      return;
    }

    await db
      .delete(participationEventTimeBlockInclusion)
      .where(
        and(
          eq(
            participationEventTimeBlockInclusion.participationId,
            input.participationId,
          ),
          withChurchIsolation(
            participationEventTimeBlockInclusion,
            input.churchId,
          ),
          notInArray(
            participationEventTimeBlockInclusion.eventTimeBlockId,
            input.eventTimeBlockIds,
          ),
        ),
      );

    const existing = await db
      .select({
        eventTimeBlockId: participationEventTimeBlockInclusion.eventTimeBlockId,
      })
      .from(participationEventTimeBlockInclusion)
      .where(
        and(
          eq(
            participationEventTimeBlockInclusion.participationId,
            input.participationId,
          ),
          withChurchIsolation(
            participationEventTimeBlockInclusion,
            input.churchId,
          ),
          inArray(
            participationEventTimeBlockInclusion.eventTimeBlockId,
            input.eventTimeBlockIds,
          ),
        ),
      );
    const existingIds = new Set(existing.map((row) => row.eventTimeBlockId));
    const missing = input.eventTimeBlockIds.filter(
      (eventTimeBlockId) => !existingIds.has(eventTimeBlockId),
    );

    if (missing.length > 0) {
      await db.insert(participationEventTimeBlockInclusion).values(
        missing.map((eventTimeBlockId) => ({
          churchId: input.churchId,
          participationId: input.participationId,
          eventTimeBlockId,
        })),
      );
    }
  }

  async addInclusion(input: AddInclusionInput): Promise<void> {
    const db = getClient(this.db, input.tx);
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
    const db = getClient(this.db, input.tx);
    await db
      .update(ministryParticipation)
      .set({ touchedAt: nowAsDate() })
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation(ministryParticipation, input.churchId),
          isNull(ministryParticipation.touchedAt),
        ),
      );
  }

  async listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryRow[]> {
    const db = getClient(this.db, input.tx);

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
          withChurchIsolation(cycle, input.churchId),
          eq(cycle.state, 'sent'),
        ),
      )
      .orderBy(asc(cycle.startDate));

    if (sentCycles.length === 0) {
      return [];
    }

    const sentCycleIds = sentCycles.map((cycle) => cycle.id);
    const cycles: typeof sentCycles = input.teamId ? [] : sentCycles;

    if (input.teamId) {
      const teamCycleRows = await db
        .select({ cycleId: event.cycleId })
        .from(shiftRequirement)
        .innerJoin(
          ministryParticipation,
          eq(shiftRequirement.participationId, ministryParticipation.id),
        )
        .innerJoin(event, eq(ministryParticipation.eventId, event.id))
        .where(
          and(
            withChurchIsolation(shiftRequirement, input.churchId),
            withChurchIsolation(ministryParticipation, input.churchId),
            withChurchIsolation(event, input.churchId),
            eq(ministryParticipation.ministryId, input.ministryId),
            eq(shiftRequirement.teamId, input.teamId),
            inArray(event.cycleId, sentCycleIds),
          ),
        );
      const teamCycleIds = new Set(teamCycleRows.map((row) => row.cycleId));
      cycles.push(...sentCycles.filter((cycle) => teamCycleIds.has(cycle.id)));
    }

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
          withChurchIsolation(ministryParticipation, input.churchId),
          withChurchIsolation(event, input.churchId),
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
                withChurchIsolation(
                  participationEventTimeBlockInclusion,
                  input.churchId,
                ),
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
}
