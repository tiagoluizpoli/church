import { NotFoundError } from '@church/core';
import { eventTemplate, templatePrecedence } from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { EventTemplateId } from '../../domain/branded-ids';
import type {
  DeleteTemplatePrecedencesInput,
  ListTemplatePrecedencesInput,
  SaveTemplatePrecedencesInput,
  TemplatePrecedenceRepository,
  UpdateTemplatePrecedenceInput,
} from '../../domain/contracts/infrastructure/template-precedence.repository';
import type { TemplatePrecedence } from '../../domain/template-precedence';
import type { AnyDrizzleDb } from './drizzle-db.types';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';

interface DrizzleTemplatePrecedenceRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleTemplatePrecedenceRepository
  implements TemplatePrecedenceRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleTemplatePrecedenceRepositoryInput) {
    this.db = db;
  }

  async listByTemplate(
    input: ListTemplatePrecedencesInput,
  ): Promise<TemplatePrecedence[]> {
    if (!isValidUuid(input.templateId)) return [];
    const db = getClient({ db: this.db, tx: input.tx });
    const templateId = input.templateId.toLowerCase();
    const rows = await db
      .select({
        templateAId: templatePrecedence.templateAId,
        templateBId: templatePrecedence.templateBId,
        outcome: templatePrecedence.outcome,
      })
      .from(templatePrecedence)
      .innerJoin(
        eventTemplate,
        eq(
          eventTemplate.id,
          sql`case when ${templatePrecedence.templateAId} = ${templateId} then ${templatePrecedence.templateBId} else ${templatePrecedence.templateAId} end`,
        ),
      )
      .where(
        and(
          withChurchIsolation({
            table: templatePrecedence,
            churchId: input.churchId,
          }),
          or(
            eq(templatePrecedence.templateAId, templateId),
            eq(templatePrecedence.templateBId, templateId),
          ),
        ),
      )
      .orderBy(
        asc(sql`lower(${eventTemplate.name})`),
        asc(eventTemplate.name),
        asc(eventTemplate.id),
      );
    return rows.map((row) => ({
      templateAId: row.templateAId as EventTemplateId,
      templateBId: row.templateBId as EventTemplateId,
      outcome: row.outcome,
    }));
  }

  async save(input: SaveTemplatePrecedencesInput): Promise<void> {
    if (input.precedences.length === 0) return;
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .insert(templatePrecedence)
      .values(
        input.precedences.map((precedence) => ({
          churchId: input.churchId,
          ...precedence,
        })),
      )
      .onConflictDoUpdate({
        target: [
          templatePrecedence.templateAId,
          templatePrecedence.templateBId,
        ],
        set: { outcome: sql`excluded.outcome`, updatedAt: nowAsDate() },
      });
  }

  async delete(input: DeleteTemplatePrecedencesInput): Promise<void> {
    if (input.precedences.length === 0) return;
    const pairs = input.precedences.map(({ templateAId, templateBId }) =>
      and(
        eq(templatePrecedence.templateAId, templateAId),
        eq(templatePrecedence.templateBId, templateBId),
      ),
    );
    await getClient({ db: this.db, tx: input.tx })
      .delete(templatePrecedence)
      .where(
        and(
          withChurchIsolation({
            table: templatePrecedence,
            churchId: input.churchId,
          }),
          or(...pairs),
        ),
      );
  }

  async update(input: UpdateTemplatePrecedenceInput): Promise<void> {
    const { templateAId, templateBId, outcome } = input.precedence;
    const notFound = new NotFoundError(
      `Template precedence not found: ${templateAId}/${templateBId}`,
    );
    if (!isValidUuid(templateAId) || !isValidUuid(templateBId)) throw notFound;
    const db = getClient({ db: this.db, tx: input.tx });
    const updated = await db
      .update(templatePrecedence)
      .set({ outcome, updatedAt: nowAsDate() })
      .where(
        and(
          withChurchIsolation({
            table: templatePrecedence,
            churchId: input.churchId,
          }),
          eq(templatePrecedence.templateAId, templateAId),
          eq(templatePrecedence.templateBId, templateBId),
        ),
      )
      .returning({ id: templatePrecedence.id });
    if (updated.length === 0) throw notFound;
  }
}
