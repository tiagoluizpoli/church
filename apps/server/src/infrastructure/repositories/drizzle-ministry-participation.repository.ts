import { NotFoundError } from '@church/core';
import {
  event,
  ministryParticipation,
  participationSlotInclusion,
  planningCycle,
} from '@church/db';
import { and, asc, count, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type {
  AddInclusionInput,
  CreateParticipationInput,
  FindParticipationByMinistryEventInput,
  GetParticipationInput,
  ListInclusionsInput,
  ListMinistryCycleSummariesInput,
  ListParticipationsByEventInput,
  ListParticipationsByIdsInput,
  ListParticipationsByMinistryInput,
  MinistryCycleSummaryRow,
  MinistryParticipationRepository,
  ReplaceInclusionsInput,
  TouchParticipationInput,
  UpdateParticipationStateInput,
} from '../../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryParticipation } from '../../domain/entities/ministry-participation';
import { aggregateCycleTailoringStatus } from '../../domain/entities/ministry-participation';
import type { ParticipationSlotInclusion } from '../../domain/entities/participation-slot-inclusion';
import {
  mapMinistryParticipation,
  mapParticipationSlotInclusion,
} from '../mappers/ministry-participation.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleMinistryParticipationRepository
  implements MinistryParticipationRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

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
        updatedAt: new Date(),
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
  ): Promise<ParticipationSlotInclusion[]> {
    const db = getClient(this.db, input.tx);
    const rows = await db
      .select()
      .from(participationSlotInclusion)
      .where(
        and(
          eq(participationSlotInclusion.participationId, input.participationId),
          withChurchIsolation(participationSlotInclusion, input.churchId),
        ),
      );

    return rows.map(mapParticipationSlotInclusion);
  }

  async replaceInclusions(input: ReplaceInclusionsInput): Promise<void> {
    const db = getClient(this.db, input.tx);

    if (input.timeSlotIds.length === 0) {
      await db
        .delete(participationSlotInclusion)
        .where(
          and(
            eq(
              participationSlotInclusion.participationId,
              input.participationId,
            ),
            withChurchIsolation(participationSlotInclusion, input.churchId),
          ),
        );
      return;
    }

    await db
      .delete(participationSlotInclusion)
      .where(
        and(
          eq(participationSlotInclusion.participationId, input.participationId),
          withChurchIsolation(participationSlotInclusion, input.churchId),
          notInArray(participationSlotInclusion.timeSlotId, input.timeSlotIds),
        ),
      );

    const existing = await db
      .select({ timeSlotId: participationSlotInclusion.timeSlotId })
      .from(participationSlotInclusion)
      .where(
        and(
          eq(participationSlotInclusion.participationId, input.participationId),
          withChurchIsolation(participationSlotInclusion, input.churchId),
          inArray(participationSlotInclusion.timeSlotId, input.timeSlotIds),
        ),
      );
    const existingIds = new Set(existing.map((row) => row.timeSlotId));
    const missing = input.timeSlotIds.filter(
      (timeSlotId) => !existingIds.has(timeSlotId),
    );

    if (missing.length > 0) {
      await db.insert(participationSlotInclusion).values(
        missing.map((timeSlotId) => ({
          churchId: input.churchId,
          participationId: input.participationId,
          timeSlotId,
        })),
      );
    }
  }

  async addInclusion(input: AddInclusionInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .insert(participationSlotInclusion)
      .values({
        churchId: input.churchId,
        participationId: input.participationId,
        timeSlotId: input.timeSlotId,
      })
      .onConflictDoNothing();
  }

  async touch(input: TouchParticipationInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .update(ministryParticipation)
      .set({ touchedAt: new Date() })
      .where(
        and(
          eq(ministryParticipation.id, input.participationId),
          withChurchIsolation(ministryParticipation, input.churchId),
          isNull(ministryParticipation.touchedAt),
        ),
      );
  }

  async listMinistryCycleSummaries(
    input: ListMinistryCycleSummariesInput,
  ): Promise<MinistryCycleSummaryRow[]> {
    const db = getClient(this.db, input.tx);

    const cycles = await db
      .select({
        id: planningCycle.id,
        name: planningCycle.name,
        startDate: planningCycle.startDate,
        endDate: planningCycle.endDate,
      })
      .from(planningCycle)
      .where(
        and(
          withChurchIsolation(planningCycle, input.churchId),
          eq(planningCycle.state, 'locked'),
        ),
      )
      .orderBy(asc(planningCycle.startDate));

    if (cycles.length === 0) {
      return [];
    }

    const cycleIds = cycles.map((cycle) => cycle.id);

    // Ministry-scoped participations joined to their cycle, church-isolated
    // on both sides of the join. No fanout risk here (one row per event).
    const participations = await db
      .select({
        id: ministryParticipation.id,
        cycleId: event.planningCycleId,
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
          inArray(event.planningCycleId, cycleIds),
        ),
      );

    const participationIds = participations.map((row) => row.id);

    // Slot counts computed as a separate query (not an additional join on
    // the query above) specifically to avoid join fanout inflating the
    // touched/published/fired-or-later counts derived from `participations`.
    const slotCounts =
      participationIds.length === 0
        ? []
        : await db
            .select({
              participationId: participationSlotInclusion.participationId,
              slotCount: count(),
            })
            .from(participationSlotInclusion)
            .where(
              and(
                withChurchIsolation(participationSlotInclusion, input.churchId),
                inArray(
                  participationSlotInclusion.participationId,
                  participationIds,
                ),
              ),
            )
            .groupBy(participationSlotInclusion.participationId);

    const slotCountByParticipationId = new Map(
      slotCounts.map((row) => [row.participationId, row.slotCount]),
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
      const slotCount = cycleParticipations.reduce(
        (sum, participation) =>
          sum + (slotCountByParticipationId.get(participation.id) ?? 0),
        0,
      );
      const touchedCount = cycleParticipations.filter(
        (participation) => participation.touchedAt !== null,
      ).length;
      const publishedCount = cycleParticipations.filter(
        (participation) => participation.state === 'published',
      ).length;
      const firedOrLaterCount = cycleParticipations.filter(
        (participation) => participation.state !== 'tailoring',
      ).length;

      const { status, availabilityFiredForAll, availabilityFiredForAny } =
        aggregateCycleTailoringStatus({
          eventCount,
          touchedCount,
          publishedCount,
          firedOrLaterCount,
        });

      return {
        cycleId: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        isPartOf: eventCount > 0,
        eventCount,
        slotCount,
        status,
        availabilityFiredForAll,
        availabilityFiredForAny,
      };
    });
  }
}
