import { NotFoundError } from '@church/core';
import { cycle, event, ministry, ministryParticipation } from '@church/db';
import { nowAsDate, toDate } from '@church/time';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { CycleId } from '../../domain/branded-ids';
import type {
  ArchiveMinistryRecordInput,
  CreateMinistryRecordInput,
  GetMinistryByIdInput,
  GetMinistrySettingsInput,
  ListMinistriesByChurchInput,
  ListUnendedParticipationCyclesInput,
  LockActiveMinistryInput,
  MinistryRepository,
  ParticipationCycle,
  RenameMinistryRecordInput,
  UpdateMinistryDefaultDirectionInput,
} from '../../domain/contracts/infrastructure/ministry.repository';
import type {
  Ministry,
  MinistrySettings,
} from '../../domain/entities/ministry';
import { MinistryNameInUseError } from '../../domain/errors/ministry-name-in-use';
import { mapMinistry } from '../mappers/ministry.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

const ACTIVE_NAME_CONSTRAINT = 'ministry_church_active_name_idx';

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
      throw new MinistryNameInUseError();
    }
    throw error;
  }
}

interface DrizzleMinistryRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleMinistryRepository implements MinistryRepository {
  constructor({ db }: DrizzleMinistryRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async getById({ churchId, id, tx }: GetMinistryByIdInput): Promise<Ministry> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Ministry not found: ${id}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(ministry)
      .where(eq(ministry.id, id))
      .limit(1);
    if (!row || row.churchId !== churchId)
      throw new NotFoundError(`Ministry not found: ${id}`);
    return mapMinistry(row);
  }

  async listByChurch({
    churchId,
    ids,
    tx,
  }: ListMinistriesByChurchInput): Promise<Ministry[]> {
    if (ids?.length === 0) return [];
    const rows = await getClient({ db: this.db, tx })
      .select()
      .from(ministry)
      .where(
        and(
          withChurchIsolation({ table: ministry, churchId }),
          isNull(ministry.deletedAt),
          ids ? inArray(ministry.id, ids) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${ministry.name})`), asc(ministry.id));
    return rows.map(mapMinistry);
  }

  async create({
    churchId,
    name,
    tx,
  }: CreateMinistryRecordInput): Promise<Ministry> {
    const insert = getClient({ db: this.db, tx })
      .insert(ministry)
      .values({ churchId, name })
      .returning();
    const [row] = await refuseNameInUse({ write: insert });
    if (!row) throw new Error('Ministry insert failed');
    return mapMinistry(row);
  }

  async rename({
    churchId,
    ministryId,
    name,
    tx,
  }: RenameMinistryRecordInput): Promise<Ministry> {
    if (!isValidUuid(ministryId)) {
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    }
    const update = getClient({ db: this.db, tx })
      .update(ministry)
      .set({ name, updatedAt: nowAsDate() })
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation({ table: ministry, churchId }),
          isNull(ministry.deletedAt),
        ),
      )
      .returning();
    const [row] = await refuseNameInUse({ write: update });
    if (!row) throw new NotFoundError(`Ministry not found: ${ministryId}`);
    return mapMinistry(row);
  }

  async lockActive({
    churchId,
    ministryId,
    strength,
    tx,
  }: LockActiveMinistryInput): Promise<Ministry> {
    if (!isValidUuid(ministryId)) {
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    }
    // A child insert's foreign key already waits for archive's FOR UPDATE, but
    // its earlier read of the Ministry as active would be stale; the explicit
    // lock re-reads it after a concurrent archive commits.
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(ministry)
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation({ table: ministry, churchId }),
          isNull(ministry.deletedAt),
        ),
      )
      .for(strength)
      .limit(1);
    if (!row) throw new NotFoundError(`Ministry not found: ${ministryId}`);
    return mapMinistry(row);
  }

  async listUnendedParticipationCycles({
    churchId,
    ministryId,
    now,
    tx,
  }: ListUnendedParticipationCyclesInput): Promise<ParticipationCycle[]> {
    // Event end decides, not its status: cancelled and stale-status Events still block.
    const rows = await getClient({ db: this.db, tx })
      .selectDistinct({ cycleId: cycle.id, cycleName: cycle.name })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(cycle, eq(cycle.id, event.cycleId))
      .where(
        and(
          eq(ministryParticipation.ministryId, ministryId),
          withChurchIsolation({ table: ministryParticipation, churchId }),
          gt(event.end, toDate({ instant: now })),
        ),
      )
      .orderBy(asc(cycle.name), asc(cycle.id));
    return rows.map((row) => ({
      cycleId: row.cycleId as CycleId,
      cycleName: row.cycleName,
    }));
  }

  async archive({
    churchId,
    ministryId,
    archivedAt,
    tx,
  }: ArchiveMinistryRecordInput): Promise<void> {
    const date = toDate({ instant: archivedAt });
    await getClient({ db: this.db, tx })
      .update(ministry)
      .set({ deletedAt: date, updatedAt: date })
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation({ table: ministry, churchId }),
        ),
      );
  }

  async getSettings({
    churchId,
    ministryId,
    tx,
  }: GetMinistrySettingsInput): Promise<MinistrySettings> {
    const m = await this.getById({ churchId, id: ministryId, tx });
    return { defaultDirection: m.defaultDirection };
  }

  async updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(ministry)
      .set({
        defaultDirection: input.defaultDirection,
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(ministry.id, input.ministryId),
          withChurchIsolation({ table: ministry, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Ministry not found: ${input.ministryId}`);
    }

    return mapMinistry(row);
  }
}
