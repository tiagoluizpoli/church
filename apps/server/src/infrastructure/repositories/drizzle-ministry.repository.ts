import { NotFoundError } from '@church/core';
import {
  cycle,
  event,
  ministry,
  ministryParticipation,
  sector,
} from '@church/db';
import { nowAsDate, toDate } from '@church/time';
import {
  and,
  asc,
  count,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  notExists,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { CycleId } from '../../domain/branded-ids';
import type {
  ArchiveMinistryRecordInput,
  CreateMinistryRecordInput,
  GetMinistryByIdInput,
  GetMinistrySettingsInput,
  ListMinistriesByChurchInput,
  ListMinistryPageInput,
  ListUnendedParticipationCyclesInput,
  LockActiveMinistryInput,
  MinistryPageRecord,
  MinistryRepository,
  ParticipationCycle,
  RenameMinistryRecordInput,
  UpdateMinistryDefaultDirectionInput,
} from '../../domain/contracts/infrastructure/ministry.repository';
import type {
  Ministry,
  MinistryListCounts,
  MinistrySettings,
} from '../../domain/entities/ministry';
import { MinistryNameInUseError } from '../../domain/errors/ministry-name-in-use';
import {
  decodeMinistryListCursor,
  encodeMinistryListCursor,
} from '../../domain/ministry-list-cursor';
import { mapMinistry } from '../mappers/ministry.mapper';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type {
  DrizzleMinistryRepositoryInput,
  RefuseNameInUseInput,
} from './drizzle-ministry.repository.types';
import {
  containsPattern,
  getClient,
  isValidUuid,
  withChurchIsolation,
} from './helpers';
import { isUniqueViolation } from './unique-violation';

const ACTIVE_NAME_CONSTRAINT = 'ministry_church_active_name_idx';

const NO_MINISTRIES: MinistryListCounts = { total: 0, review: 0, noSectors: 0 };

function countWhere(condition: SQL) {
  return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
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

  async listPage({
    churchId,
    ids,
    search,
    status,
    reviewIds,
    cursor,
    limit,
  }: ListMinistryPageInput): Promise<MinistryPageRecord> {
    if (ids?.length === 0) return { ministries: [], counts: NO_MINISTRIES };
    const client = getClient({ db: this.db });
    const inScope = and(
      withChurchIsolation({ table: ministry, churchId }),
      isNull(ministry.deletedAt),
      ids ? inArray(ministry.id, ids) : undefined,
    );
    const needsReview =
      reviewIds.length > 0 ? inArray(ministry.id, reviewIds) : sql`false`;
    const withoutSectors = notExists(
      client
        .select({ id: sector.id })
        .from(sector)
        .where(
          and(eq(sector.ministryId, ministry.id), isNull(sector.archivedAt)),
        ),
    );
    // Header totals for the whole scope; the filters and cursor never apply.
    const [counts] = await client
      .select({
        total: count(),
        review: countWhere(needsReview),
        noSectors: countWhere(withoutSectors),
      })
      .from(ministry)
      .where(inScope);

    const position = cursor ? decodeMinistryListCursor({ cursor }) : undefined;
    const sortName = sql`lower(${ministry.name})`;
    const rows = await client
      .select()
      .from(ministry)
      .where(
        and(
          inScope,
          search
            ? ilike(ministry.name, containsPattern({ value: search }))
            : undefined,
          status === 'review' ? needsReview : undefined,
          status === 'no-sectors' ? withoutSectors : undefined,
          position &&
            sql`(${sortName}, ${ministry.id}) > (lower(${position.name}), ${position.id}::uuid)`,
        ),
      )
      .orderBy(asc(sortName), asc(ministry.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      ministries: page.map(mapMinistry),
      nextCursor:
        rows.length > limit && last
          ? encodeMinistryListCursor({ name: last.name, id: last.id })
          : undefined,
      counts: counts ?? NO_MINISTRIES,
    };
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
