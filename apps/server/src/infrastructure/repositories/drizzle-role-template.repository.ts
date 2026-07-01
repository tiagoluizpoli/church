import { NotFoundError } from '@church/core';
import { roleTemplate, roleTemplateItem } from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  CreateRoleTemplateInput,
  RoleTemplateRepository,
  UpdateRoleTemplateInput,
} from '../../application/contracts/role-template.repository';
import type { TransactionContext } from '../../application/contracts/transaction-context';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type {
  RoleTemplate,
  RoleTemplateId,
} from '../../domain/entities/role-template';
import {
  mapRoleTemplate,
  mapRoleTemplateItem,
} from '../mappers/role-template.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleRoleTemplateRepository implements RoleTemplateRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  private async fetchItems(
    db: AnyDrizzleDb,
    templateIds: string[],
  ): Promise<Map<string, ReturnType<typeof mapRoleTemplateItem>[]>> {
    const map = new Map<string, ReturnType<typeof mapRoleTemplateItem>[]>();
    if (templateIds.length === 0) return map;
    const itemRows = await db
      .select()
      .from(roleTemplateItem)
      .where(inArray(roleTemplateItem.templateId, templateIds));
    for (const row of itemRows) {
      const list = map.get(row.templateId) ?? [];
      list.push(mapRoleTemplateItem(row));
      map.set(row.templateId, list);
    }
    return map;
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<RoleTemplate[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select()
      .from(roleTemplate)
      .where(
        and(
          withChurchIsolation(roleTemplate, churchId),
          eq(roleTemplate.ministryId, ministryId),
        ),
      );
    const itemsByTemplate = await this.fetchItems(
      db,
      rows.map((r) => r.id),
    );
    return rows.map((r) => mapRoleTemplate(r, itemsByTemplate.get(r.id) ?? []));
  }

  async getById(
    churchId: ChurchId,
    id: RoleTemplateId,
    tx?: TransactionContext,
  ): Promise<RoleTemplate> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`RoleTemplate not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(roleTemplate)
      .where(
        and(
          eq(roleTemplate.id, id),
          withChurchIsolation(roleTemplate, churchId),
        ),
      );
    if (!row) throw new NotFoundError(`RoleTemplate not found: ${id}`);
    const itemsByTemplate = await this.fetchItems(db, [row.id]);
    return mapRoleTemplate(row, itemsByTemplate.get(row.id) ?? []);
  }

  async create(
    churchId: ChurchId,
    input: CreateRoleTemplateInput,
    tx?: TransactionContext,
  ): Promise<RoleTemplate> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .insert(roleTemplate)
      .values({
        churchId,
        ministryId: input.ministryId,
        name: input.name,
      })
      .returning();
    if (!row) throw new Error('RoleTemplate insert failed');

    if (input.items.length > 0) {
      await db.insert(roleTemplateItem).values(
        input.items.map((item) => ({
          churchId,
          templateId: row.id,
          roleId: item.roleId,
          requiredCount: item.requiredCount,
        })),
      );
    }
    return this.getById(churchId, row.id as RoleTemplateId, tx);
  }

  async update(
    churchId: ChurchId,
    id: RoleTemplateId,
    input: UpdateRoleTemplateInput,
    tx?: TransactionContext,
  ): Promise<RoleTemplate> {
    const db = getClient(this.db, tx);
    if (input.name !== undefined) {
      await db
        .update(roleTemplate)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(roleTemplate.id, id),
            withChurchIsolation(roleTemplate, churchId),
          ),
        );
    }
    if (input.items !== undefined) {
      await db
        .delete(roleTemplateItem)
        .where(eq(roleTemplateItem.templateId, id));
      if (input.items.length > 0) {
        await db.insert(roleTemplateItem).values(
          input.items.map((item) => ({
            churchId,
            templateId: id,
            roleId: item.roleId,
            requiredCount: item.requiredCount,
          })),
        );
      }
    }
    return this.getById(churchId, id, tx);
  }

  async deleteById(
    churchId: ChurchId,
    id: RoleTemplateId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(roleTemplate)
      .where(
        and(
          eq(roleTemplate.id, id),
          withChurchIsolation(roleTemplate, churchId),
        ),
      );
  }
}
