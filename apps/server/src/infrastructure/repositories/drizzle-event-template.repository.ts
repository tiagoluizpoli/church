import { NotFoundError } from '@church/core';
import { eventTemplate, timeBlock } from '@church/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { EventTemplateId } from '../../domain/branded-ids';
import type {
  CreateEventTemplateInput,
  DeleteEventTemplateInput,
  EventTemplateRepository,
  GetEventTemplateInput,
  GetEventTemplatesByIdsInput,
  ListEventTemplatesInput,
  UpdateEventTemplateInput,
} from '../../domain/contracts/infrastructure/event-template.repository';
import type { EventTemplate } from '../../domain/entities/event-template';
import { mapEventTemplate } from '../mappers/event-template.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface EventTemplateGraphRow {
  template: typeof eventTemplate.$inferSelect;
  blocks: Array<typeof timeBlock.$inferSelect>;
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
    const db = getClient(this.db, input.tx);
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
      await db.insert(timeBlock).values(
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

  async update(input: UpdateEventTemplateInput): Promise<EventTemplate> {
    const db = getClient(this.db, input.tx);
    const [templateRow] = await db
      .update(eventTemplate)
      .set({
        name: input.name,
        weekday: input.weekday,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation(eventTemplate, input.churchId),
        ),
      )
      .returning();

    if (!templateRow) {
      throw new NotFoundError(`Event template not found: ${input.templateId}`);
    }

    await db
      .delete(timeBlock)
      .where(eq(timeBlock.templateId, input.templateId));

    if (input.blocks.length > 0) {
      await db.insert(timeBlock).values(
        input.blocks.map((block) => ({
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

  async delete(input: DeleteEventTemplateInput): Promise<void> {
    const db = getClient(this.db, input.tx);
    await db
      .delete(eventTemplate)
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation(eventTemplate, input.churchId),
        ),
      );
  }

  async list(input: ListEventTemplatesInput): Promise<EventTemplate[]> {
    const db = getClient(this.db, input.tx);
    const templateRows = await db
      .select()
      .from(eventTemplate)
      .where(withChurchIsolation(eventTemplate, input.churchId))
      .orderBy(asc(eventTemplate.name));

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
      throw new NotFoundError(`Event template not found: ${input.templateId}`);
    }

    const db = getClient(this.db, input.tx);
    const [templateRow] = await db
      .select()
      .from(eventTemplate)
      .where(
        and(
          eq(eventTemplate.id, input.templateId),
          withChurchIsolation(eventTemplate, input.churchId),
        ),
      );

    if (!templateRow) {
      throw new NotFoundError(`Event template not found: ${input.templateId}`);
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

    const db = getClient(this.db, input.tx);
    const templateRows = await db
      .select()
      .from(eventTemplate)
      .where(
        and(
          withChurchIsolation(eventTemplate, input.churchId),
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

  private async mapTemplateGraph(input: {
    template: typeof eventTemplate.$inferSelect;
    tx?: CreateEventTemplateInput['tx'];
  }): Promise<EventTemplate> {
    const db = getClient(this.db, input.tx);
    const blocks = await db
      .select()
      .from(timeBlock)
      .where(eq(timeBlock.templateId, input.template.id))
      .orderBy(asc(timeBlock.order));

    const graph: EventTemplateGraphRow = {
      template: input.template,
      blocks,
    };

    return mapEventTemplate(graph);
  }
}
