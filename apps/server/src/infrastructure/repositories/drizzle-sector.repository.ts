import { NotFoundError } from '@church/core';
import {
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  sector,
  shift,
  shiftRequirement,
  usualSetup,
} from '@church/db';
import { nowAsDate, toDate } from '@church/time';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { ArchiveBlocker } from '../../domain/archive-blockers';
import type { SectorId } from '../../domain/branded-ids';
import type {
  CreateSectorRecordInput,
  GetSectorInput,
  ListSectorArchiveBlockersInput,
  ListSectorsByMinistryInput,
  LockActiveSectorsInput,
  RenameSectorRecordInput,
  SectorArchiveInput,
  SectorRepository,
} from '../../domain/contracts/infrastructure/sector.repository';
import type { Sector } from '../../domain/entities/sector';
import { SectorNameInUseError } from '../../domain/errors/sector-name-in-use';
import { mapSector } from '../mappers/sector.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

const ACTIVE_NAME_CONSTRAINT = 'sector_ministry_active_name_idx';

interface RefuseNameInUseInput<T> {
  write: Promise<T>;
}

/** The active-name index refusal, including races, as the domain conflict. */
async function refuseNameInUse<T>({
  write,
}: RefuseNameInUseInput<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation({ error, constraint: ACTIVE_NAME_CONSTRAINT })) {
      throw new SectorNameInUseError();
    }
    throw error;
  }
}

interface ActiveSectorInput {
  churchId: string;
  ministryId: string;
  sectorId: string;
}

function activeSector({ churchId, ministryId, sectorId }: ActiveSectorInput) {
  return and(
    eq(sector.id, sectorId),
    withChurchIsolation({ table: sector, churchId }),
    eq(sector.ministryId, ministryId),
    isNull(sector.archivedAt),
  );
}

interface DrizzleSectorRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleSectorRepository implements SectorRepository {
  constructor({ db }: DrizzleSectorRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listByMinistry(input: ListSectorsByMinistryInput): Promise<Sector[]> {
    const rows = await getClient({ db: this.db, tx: input.tx })
      .select()
      .from(sector)
      .where(
        and(
          withChurchIsolation({ table: sector, churchId: input.churchId }),
          eq(sector.ministryId, input.ministryId),
          isNull(sector.archivedAt),
        ),
      )
      .orderBy(asc(sql`lower(${sector.name})`), asc(sector.id));
    return rows.map(mapSector);
  }

  async getById(input: GetSectorInput): Promise<Sector> {
    if (!isValidUuid(input.sectorId)) {
      throw new NotFoundError(`Sector not found: ${input.sectorId}`);
    }
    const [row] = await getClient({ db: this.db, tx: input.tx })
      .select()
      .from(sector)
      .where(
        and(
          eq(sector.id, input.sectorId),
          withChurchIsolation({ table: sector, churchId: input.churchId }),
        ),
      );
    if (!row) throw new NotFoundError(`Sector not found: ${input.sectorId}`);
    return mapSector(row);
  }

  async lockActive({
    churchId,
    ministryId,
    sectorIds,
    tx,
  }: LockActiveSectorsInput): Promise<Set<SectorId>> {
    const ids = sectorIds.filter((id) => isValidUuid(id));
    if (ids.length === 0) return new Set();
    const rows = await getClient({ db: this.db, tx })
      .select({ id: sector.id })
      .from(sector)
      .where(
        and(
          inArray(sector.id, ids),
          withChurchIsolation({ table: sector, churchId }),
          eq(sector.ministryId, ministryId),
          isNull(sector.archivedAt),
        ),
      )
      .for('share');
    return new Set(rows.map((row) => row.id as SectorId));
  }

  async create({
    churchId,
    ministryId,
    name,
    tx,
  }: CreateSectorRecordInput): Promise<Sector> {
    const insert = getClient({ db: this.db, tx })
      .insert(sector)
      .values({ churchId, ministryId, name })
      .returning();
    const [row] = await refuseNameInUse({ write: insert });
    if (!row) throw new Error('Sector insert failed');
    return mapSector(row);
  }

  async rename({
    churchId,
    ministryId,
    sectorId,
    name,
    tx,
  }: RenameSectorRecordInput): Promise<Sector> {
    if (!isValidUuid(sectorId)) {
      throw new NotFoundError(`Sector not found: ${sectorId}`);
    }
    const update = getClient({ db: this.db, tx })
      .update(sector)
      .set({ name })
      .where(activeSector({ churchId, ministryId, sectorId }))
      .returning();
    const [row] = await refuseNameInUse({ write: update });
    if (!row) throw new NotFoundError(`Sector not found: ${sectorId}`);
    return mapSector(row);
  }

  async lockActiveForArchive({
    churchId,
    ministryId,
    sectorId,
    tx,
  }: SectorArchiveInput): Promise<Sector> {
    if (!isValidUuid(sectorId)) {
      throw new NotFoundError(`Sector not found: ${sectorId}`);
    }
    // FOR UPDATE conflicts with the FOR SHARE of `lockActive` and the FK
    // KEY SHARE of a requirement insert, so concurrent new use serializes here.
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(sector)
      .where(activeSector({ churchId, ministryId, sectorId }))
      .for('update');
    if (!row) throw new NotFoundError(`Sector not found: ${sectorId}`);
    return mapSector(row);
  }

  async listArchiveBlockers({
    churchId,
    sectorId,
    now,
    tx,
  }: ListSectorArchiveBlockersInput): Promise<ArchiveBlocker[]> {
    const client = getClient({ db: this.db, tx });
    const requirementRows = await client
      .selectDistinct({
        ministryId: ministry.id,
        ministryName: ministry.name,
        cycleId: cycle.id,
        cycleName: cycle.name,
        eventId: event.id,
        eventTimeBlockId: eventTimeBlock.id,
        eventStart: event.start,
        blockStart: eventTimeBlock.startTime,
      })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
      .innerJoin(cycle, eq(cycle.id, event.cycleId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .where(
        and(
          eq(shiftRequirement.sectorId, sectorId),
          withChurchIsolation({ table: shiftRequirement, churchId }),
          // An ongoing Event still blocks: only its end makes it past.
          gt(event.end, toDate({ instant: now })),
        ),
      )
      .orderBy(
        asc(event.start),
        asc(eventTimeBlock.startTime),
        asc(eventTimeBlock.id),
      );
    const usualSetupRows = await client
      .select({
        ministryId: ministry.id,
        ministryName: ministry.name,
        templateTimeBlockId: usualSetup.sourceTemplateTimeBlockId,
      })
      .from(usualSetup)
      .innerJoin(ministry, eq(ministry.id, usualSetup.ministryId))
      .where(
        and(
          withChurchIsolation({ table: usualSetup, churchId }),
          sql`${usualSetup.headcounts} @> ${JSON.stringify([{ sectorId }])}::jsonb`,
        ),
      )
      .orderBy(asc(usualSetup.sourceTemplateTimeBlockId), asc(usualSetup.id));
    return [
      ...requirementRows.map(
        ({ eventStart: _start, blockStart: _block, ...location }) => ({
          kind: 'requirement' as const,
          ...location,
        }),
      ),
      ...usualSetupRows.map((location) => ({
        kind: 'usual_setup' as const,
        ...location,
      })),
    ];
  }

  async markArchived({
    churchId,
    ministryId,
    sectorId,
    tx,
  }: SectorArchiveInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(sector)
      .set({ archivedAt: nowAsDate() })
      .where(activeSector({ churchId, ministryId, sectorId }));
  }
}
