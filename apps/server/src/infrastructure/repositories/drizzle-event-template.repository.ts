import { NotFoundError } from '@church/core';
import { eventTemplate, templateTimeBlock, usualSetup } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  type EventTemplateId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type {
  CreateEventTemplateInput,
  DeleteEventTemplateInput,
  EventTemplateRepository,
  EventTemplateTimeBlockInput,
  GetEventTemplateInput,
  GetEventTemplatesByIdsInput,
  ListEventTemplatesInput,
  UpdateEventTemplateInput,
} from '../../domain/contracts/infrastructure/event-template.repository';
import type {
  EventTemplate,
  EventTemplateUsage,
} from '../../domain/entities/event-template';
import { DuplicateTemplateBlockLabelError } from '../../domain/errors/duplicate-template-block-label';
import { DuplicateTemplateNameError } from '../../domain/errors/duplicate-template-name';
import { mapEventTemplate } from '../mappers/event-template.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

interface EventTemplateGraphRow {
  template: typeof eventTemplate.$inferSelect;
  blocks: Array<typeof templateTimeBlock.$inferSelect>;
}

interface MapTemplateGraphInput {
  template: typeof eventTemplate.$inferSelect;
  tx?: CreateEventTemplateInput['tx'];
}

const NAME_UNIQUE_CONSTRAINT = 'event_template_church_name_idx';
const BLOCK_LABEL_UNIQUE_CONSTRAINT = 'template_time_block_template_label_idx';

interface RefuseUniqueViolationsInput<T> {
  write: Promise<T>;
}

/**
 * Turns the case-insensitive name and block-label index violations, including
 * races and writers that skip the manager, into domain refusals.
 */
async function refuseUniqueViolations<T>({
  write,
}: RefuseUniqueViolationsInput<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isUniqueViolation({ error, constraint: NAME_UNIQUE_CONSTRAINT })) {
      throw new DuplicateTemplateNameError();
    }
    if (
      isUniqueViolation({ error, constraint: BLOCK_LABEL_UNIQUE_CONSTRAINT })
    ) {
      throw new DuplicateTemplateBlockLabelError();
    }
    throw error;
  }
}

interface TemplateNotFoundInput {
  templateId: string;
}

function templateNotFound({
  templateId,
}: TemplateNotFoundInput): NotFoundError {
  return new NotFoundError(`Event template not found: ${templateId}`);
}

type RetainedBlockInput = EventTemplateTimeBlockInput & {
  id: TemplateTimeBlockId;
};

function isRetainedBlock(
  block: EventTemplateTimeBlockInput,
): block is RetainedBlockInput {
  return block.id !== undefined;
}

interface DrizzleEventTemplateRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleEventTemplateRepository implements EventTemplateRepository {
  constructor({ db }: DrizzleEventTemplateRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async create(input: CreateEventTemplateInput): Promise<EventTemplate> {
    return refuseUniqueViolations({ write: this.insertGraph(input) });
  }

  private async insertGraph(
    input: CreateEventTemplateInput,
  ): Promise<EventTemplate> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [templateRow] = await db
      .insert(eventTemplate)
      .values({
        churchId: input.churchId,
        name: input.name,
        weekday: input.weekday,
      })
      .returning();

    if (!templateRow) {
      throw new Error('Event template insert failed');
    }

    if (input.blocks.length > 0) {
      await db.insert(templateTimeBlock).values(
        input.blocks.map((block) => ({
          churchId: input.churchId,
          templateId: templateRow.id,
          label: block.label,
          startTime: block.startTime,
          endTime: block.endTime,
          order: block.order,
        })),
      );
    }

    return this.getById({
      churchId: input.churchId,
      templateId: templateRow.id as EventTemplateId,
      tx: input.tx,
    });
  }

  /**
   * Applies the complete desired state in place: supplied ids update their
   * block, blocks without an id are inserted, omitted blocks are deleted
   * (cascading only their Usual setup). Run inside a transaction.
   */
  async update(input: UpdateEventTemplateInput): Promise<EventTemplate> {
    return refuseUniqueViolations({ write: this.applyDesiredState(input) });
  }

  private async applyDesiredState(
    input: UpdateEventTemplateInput,
  ): Promise<EventTemplate> {
    const db = getClient({ db: this.db, tx: input.tx });
    const notFound = () => templateNotFound({ templateId: input.templateId });
    if (!isValidUuid(input.templateId)) throw notFound();

    // Row lock serializes concurrent edits of one template, so each validated
    // desired state (unique labels, contiguous order) is applied whole.
    const [locked] = await db
      .select({ id: eventTemplate.id })
      .from(eventTemplate)
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation({
            table: eventTemplate,
            churchId: input.churchId,
          }),
        ),
      )
      .for('update');
    if (!locked) throw notFound();

    const currentRows = await db
      .select({ id: templateTimeBlock.id })
      .from(templateTimeBlock)
      .where(eq(templateTimeBlock.templateId, input.templateId));
    const currentIds = new Set(currentRows.map((row) => row.id));
    const retained = input.blocks.filter(isRetainedBlock);
    // A stale, foreign-template or foreign-Church id is refused before any write.
    if (retained.some((block) => !currentIds.has(block.id))) {
      throw notFound();
    }

    await db
      .update(eventTemplate)
      .set({
        name: input.name,
        weekday: input.weekday,
        updatedAt: nowAsDate(),
      })
      .where(eq(eventTemplate.id, input.templateId));

    const retainedIds = retained.map((block) => block.id);
    await db
      .delete(templateTimeBlock)
      .where(
        and(
          eq(templateTimeBlock.templateId, input.templateId),
          retainedIds.length > 0
            ? notInArray(templateTimeBlock.id, retainedIds)
            : undefined,
        ),
      );

    // Park retained rows on distinct negative orders and on labels no trimmed
    // label can equal (a leading space plus the row id), so final orders and
    // swapped labels are written without colliding on either unique index.
    await db
      .update(templateTimeBlock)
      .set({
        order: sql`-1 - ${templateTimeBlock.order}`,
        label: sql`' ' || ${templateTimeBlock.id}`,
      })
      .where(eq(templateTimeBlock.templateId, input.templateId));

    for (const block of retained) {
      await db
        .update(templateTimeBlock)
        .set({
          label: block.label,
          startTime: block.startTime,
          endTime: block.endTime,
          order: block.order,
        })
        .where(eq(templateTimeBlock.id, block.id));
    }

    const added = input.blocks.filter((block) => !isRetainedBlock(block));
    if (added.length > 0) {
      await db.insert(templateTimeBlock).values(
        added.map((block) => ({
          churchId: input.churchId,
          templateId: input.templateId,
          label: block.label,
          startTime: block.startTime,
          endTime: block.endTime,
          order: block.order,
        })),
      );
    }

    return this.getById({
      churchId: input.churchId,
      templateId: input.templateId,
      tx: input.tx,
    });
  }

  /**
   * Distinct Ministries whose persisted Usual setup entries (including
   * `serves: false`) reference each current block, and their union.
   */
  async getUsage(input: GetEventTemplateInput): Promise<EventTemplateUsage> {
    await this.getById(input);
    const db = getClient({ db: this.db, tx: input.tx });
    const setupJoin = and(
      eq(usualSetup.sourceTemplateTimeBlockId, templateTimeBlock.id),
      eq(usualSetup.churchId, templateTimeBlock.churchId),
    );
    const scope = and(
      eq(templateTimeBlock.templateId, input.templateId),
      withChurchIsolation({
        table: templateTimeBlock,
        churchId: input.churchId,
      }),
    );
    const blockRows = await db
      .select({
        blockId: templateTimeBlock.id,
        ministryCount: sql<number>`count(distinct ${usualSetup.ministryId})::int`,
      })
      .from(templateTimeBlock)
      .leftJoin(usualSetup, setupJoin)
      .where(scope)
      .groupBy(templateTimeBlock.id, templateTimeBlock.order)
      .orderBy(asc(templateTimeBlock.order));
    const [total] = await db
      .select({
        ministryCount: sql<number>`count(distinct ${usualSetup.ministryId})::int`,
      })
      .from(templateTimeBlock)
      .innerJoin(usualSetup, setupJoin)
      .where(scope);
    return {
      templateId: input.templateId,
      ministryCount: total?.ministryCount ?? 0,
      blocks: blockRows.map((row) => ({
        blockId: TemplateTimeBlockId.from(row.blockId),
        ministryCount: row.ministryCount,
      })),
    };
  }

  async delete(input: DeleteEventTemplateInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    if (!isValidUuid(input.templateId)) {
      throw templateNotFound({ templateId: input.templateId });
    }
    // One statement: blocks and setup cascade, generated-source links SET NULL.
    const deleted = await db
      .delete(eventTemplate)
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation({
            table: eventTemplate,
            churchId: input.churchId,
          }),
        ),
      )
      .returning({ id: eventTemplate.id });
    if (deleted.length === 0) {
      throw templateNotFound({ templateId: input.templateId });
    }
  }

  async list(input: ListEventTemplatesInput): Promise<EventTemplate[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const templateRows = await db
      .select()
      .from(eventTemplate)
      .where(
        withChurchIsolation({ table: eventTemplate, churchId: input.churchId }),
      )
      .orderBy(asc(sql`lower(${eventTemplate.name})`), asc(eventTemplate.name));

    return Promise.all(
      templateRows.map((templateRow) =>
        this.mapTemplateGraph({
          template: templateRow,
          tx: input.tx,
        }),
      ),
    );
  }

  async getById(input: GetEventTemplateInput): Promise<EventTemplate> {
    if (!isValidUuid(input.templateId)) {
      throw templateNotFound({ templateId: input.templateId });
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [templateRow] = await db
      .select()
      .from(eventTemplate)
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation({
            table: eventTemplate,
            churchId: input.churchId,
          }),
        ),
      );

    if (!templateRow) {
      throw templateNotFound({ templateId: input.templateId });
    }

    return this.mapTemplateGraph({
      template: templateRow,
      tx: input.tx,
    });
  }

  async getByIds(input: GetEventTemplatesByIdsInput): Promise<EventTemplate[]> {
    if (input.templateIds.length === 0) {
      return [];
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const templateRows = await db
      .select()
      .from(eventTemplate)
      .where(
        and(
          withChurchIsolation({
            table: eventTemplate,
            churchId: input.churchId,
          }),
          inArray(eventTemplate.id, input.templateIds),
        ),
      );

    return Promise.all(
      templateRows.map((templateRow) =>
        this.mapTemplateGraph({
          template: templateRow,
          tx: input.tx,
        }),
      ),
    );
  }

  private async mapTemplateGraph(
    input: MapTemplateGraphInput,
  ): Promise<EventTemplate> {
    const db = getClient({ db: this.db, tx: input.tx });
    const blocks = await db
      .select()
      .from(templateTimeBlock)
      .where(eq(templateTimeBlock.templateId, input.template.id))
      .orderBy(asc(templateTimeBlock.order));

    const graph: EventTemplateGraphRow = {
      template: input.template,
      blocks,
    };

    return mapEventTemplate(graph);
  }
}
