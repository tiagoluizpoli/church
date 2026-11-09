import { NotFoundError } from '@church/core';
import {
  event,
  ministry,
  ministryParticipation,
  sector,
  shift,
  shiftRequirement,
} from '@church/db';
import { toDate } from '@church/time';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  CreateShiftsInput,
  DeleteShiftInput,
  DeleteShiftRequirementsInput,
  DeleteShiftsByEventTimeBlockInput,
  GetRequirementForShiftInput,
  GetShiftInput,
  ListRequirementsByParticipationInput,
  ListShiftConflictFactsInput,
  ListShiftsByEventTimeBlockInput,
  ListShiftsByParticipationInput,
  SaveShiftRequirementInput,
  ShiftConflictFacts,
  ShiftRepository,
  UpdateShiftInput,
} from '../../domain/contracts/infrastructure/shift.repository';
import type { Shift } from '../../domain/entities/shift';
import type { ShiftRequirement } from '../../domain/entities/shift-requirement';
import { mapShift } from '../mappers/shift.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleShiftRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleShiftRepository implements ShiftRepository {
  constructor({ db }: DrizzleShiftRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listConflictFacts(
    input: ListShiftConflictFactsInput,
  ): Promise<ShiftConflictFacts[]> {
    if (input.shiftIds.length === 0) return [];
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select({ shift, ministryName: ministry.name, eventTitle: event.title })
      .from(shift)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .where(
        and(
          inArray(shift.id, input.shiftIds),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          withChurchIsolation({ table: event, churchId: input.churchId }),
          withChurchIsolation({ table: ministry, churchId: input.churchId }),
        ),
      );
    return rows.map(({ shift: row, ministryName, eventTitle }) => ({
      shift: mapShift(row),
      ministryName,
      eventTitle,
    }));
  }

  async createMany(input: CreateShiftsInput): Promise<Shift[]> {
    if (input.shifts.length === 0) {
      return [];
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .insert(shift)
      .values(
        input.shifts.map((entity) => ({
          id: entity.id,
          churchId: input.churchId,
          participationId: entity.participationId,
          eventTimeBlockId: entity.eventTimeBlockId,
          startTime: toDate({ instant: entity.startTime }),
          endTime: toDate({ instant: entity.endTime }),
          label: entity.label ?? null,
        })),
      )
      .returning();

    return rows.map(mapShift);
  }

  async getById(input: GetShiftInput): Promise<Shift> {
    if (!isValidUuid(input.shiftId)) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      );

    if (!row) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    return mapShift(row);
  }

  async listByParticipation(
    input: ListShiftsByParticipationInput,
  ): Promise<Shift[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      )
      .orderBy(asc(shift.startTime));

    return rows.map(mapShift);
  }

  async listByEventTimeBlock(
    input: ListShiftsByEventTimeBlockInput,
  ): Promise<Shift[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const query = db
      .select()
      .from(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          eq(shift.eventTimeBlockId, input.eventTimeBlockId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      )
      .orderBy(asc(shift.startTime));
    const rows = await (input.forUpdate ? query.for('update') : query);

    return rows.map(mapShift);
  }

  async update(input: UpdateShiftInput): Promise<Shift> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(shift)
      .set({
        ...(input.startTime !== undefined
          ? { startTime: input.startTime }
          : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
      })
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Shift not found: ${input.shiftId}`);
    }

    return mapShift(row);
  }

  async deleteById(input: DeleteShiftInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .delete(shift)
      .where(
        and(
          eq(shift.id, input.shiftId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      );
  }

  async deleteByEventTimeBlock(
    input: DeleteShiftsByEventTimeBlockInput,
  ): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .delete(shift)
      .where(
        and(
          eq(shift.participationId, input.participationId),
          eq(shift.eventTimeBlockId, input.eventTimeBlockId),
          withChurchIsolation({ table: shift, churchId: input.churchId }),
        ),
      );
  }

  async saveRequirement(
    input: SaveShiftRequirementInput,
  ): Promise<ShiftRequirement> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [existing] = await db
      .select()
      .from(shiftRequirement)
      .where(
        and(
          eq(shiftRequirement.shiftId, input.shiftId),
          eq(shiftRequirement.roleId, input.roleId),
          eq(shiftRequirement.sectorId, input.sectorId),
          withChurchIsolation({
            table: shiftRequirement,
            churchId: input.churchId,
          }),
        ),
      )
      .limit(1);

    const [row] = existing
      ? await db
          .update(shiftRequirement)
          .set({
            peopleNeeded: input.peopleNeeded,
            notes: input.notes ?? null,
          })
          .where(eq(shiftRequirement.id, existing.id))
          .returning()
      : await db
          .insert(shiftRequirement)
          .values({
            churchId: input.churchId,
            participationId: input.participationId,
            shiftId: input.shiftId,
            roleId: input.roleId,
            sectorId: input.sectorId,
            peopleNeeded: input.peopleNeeded,
            notes: input.notes ?? null,
          })
          .returning();

    if (!row) {
      throw new Error('Shift requirement upsert failed');
    }

    const [named] = await db
      .select({ name: sector.name })
      .from(sector)
      .where(eq(sector.id, row.sectorId));

    if (!named) {
      throw new Error('Shift requirement Sector not found');
    }

    return mapShiftRequirement({ row, sectorName: named.name });
  }

  async deleteRequirements({
    churchId,
    shiftRequirementIds,
    tx,
  }: DeleteShiftRequirementsInput): Promise<void> {
    if (shiftRequirementIds.length === 0) return;
    await getClient({ db: this.db, tx })
      .delete(shiftRequirement)
      .where(
        and(
          inArray(shiftRequirement.id, shiftRequirementIds),
          withChurchIsolation({ table: shiftRequirement, churchId }),
        ),
      );
  }

  async listRequirementsByParticipation(
    input: ListRequirementsByParticipationInput,
  ): Promise<ShiftRequirement[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select({ requirement: shiftRequirement, sectorName: sector.name })
      .from(shiftRequirement)
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .where(
        and(
          eq(shiftRequirement.participationId, input.participationId),
          withChurchIsolation({
            table: shiftRequirement,
            churchId: input.churchId,
          }),
        ),
      );

    return rows.map(({ requirement, sectorName }) =>
      mapShiftRequirement({
        row: requirement,
        sectorName,
      }),
    );
  }

  async getRequirementForShift(
    input: GetRequirementForShiftInput,
  ): Promise<ShiftRequirement> {
    const db = getClient({ db: this.db, tx: input.tx });
    const requirementShiftJoin = eq(shift.id, shiftRequirement.shiftId);
    const requirementSectorJoin = eq(sector.id, shiftRequirement.sectorId);
    const requirementConditions = [
      eq(shiftRequirement.id, input.shiftRequirementId),
      eq(shiftRequirement.shiftId, input.shiftId),
      eq(shiftRequirement.participationId, shift.participationId),
      withChurchIsolation({
        table: shiftRequirement,
        churchId: input.churchId,
      }),
      withChurchIsolation({ table: shift, churchId: input.churchId }),
    ];
    const requirementPredicate = and(...requirementConditions);
    const [row] = await db
      .select({
        requirement: shiftRequirement,
        sectorName: sector.name,
        eventTimeBlockId: shift.eventTimeBlockId,
      })
      .from(shiftRequirement)
      .innerJoin(shift, requirementShiftJoin)
      .innerJoin(sector, requirementSectorJoin)
      .where(requirementPredicate);

    if (!row) throw new NotFoundError('Shift requirement not found');
    const { requirement, sectorName, eventTimeBlockId } = row;
    return mapShiftRequirement({
      row: requirement,
      sectorName,
      eventTimeBlockId,
    });
  }
}
