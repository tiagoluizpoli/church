import {
  eventGroup,
  eventGroupTemplate,
  eventTemplate,
  ministry,
} from '@church/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  EventGroup,
  EventGroupRepository,
  EventGroupScopeInput,
  EventGroupSetup,
  EventGroupTemplate,
  ListChurchEventTemplatesInput,
  ReplaceEventGroupSetupInput,
} from '../../domain/contracts/infrastructure/event-group.repository';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type { DrizzleEventGroupRepositoryInput } from './drizzle-event-group.repository.types';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';

/** A Ministry's Event groups: group rows, template links and the catch-all name. */
export class DrizzleEventGroupRepository implements EventGroupRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleEventGroupRepositoryInput) {
    this.db = db;
  }

  async findSetup(input: EventGroupScopeInput): Promise<EventGroupSetup> {
    if (!isValidUuid(input.ministryId)) {
      return { groups: [], catchAllName: null };
    }
    const db = getClient({ db: this.db, tx: input.tx });
    const [owner] = await db
      .select({ catchAllName: ministry.eventGroupCatchAllName })
      .from(ministry)
      .where(
        and(
          eq(ministry.id, input.ministryId),
          withChurchIsolation({ table: ministry, churchId: input.churchId }),
        ),
      );
    const rows = await db
      .select({
        groupId: eventGroup.id,
        groupName: eventGroup.name,
        templateId: eventTemplate.id,
        templateName: eventTemplate.name,
      })
      .from(eventGroup)
      .leftJoin(
        eventGroupTemplate,
        eq(eventGroupTemplate.groupId, eventGroup.id),
      )
      .leftJoin(
        eventTemplate,
        eq(eventTemplate.id, eventGroupTemplate.eventTemplateId),
      )
      .where(
        and(
          eq(eventGroup.ministryId, input.ministryId),
          withChurchIsolation({ table: eventGroup, churchId: input.churchId }),
        ),
      )
      .orderBy(asc(eventGroup.position), asc(eventGroupTemplate.position));
    const groups = new Map<string, EventGroup>();
    for (const row of rows) {
      const group = groups.get(row.groupId) ?? {
        name: row.groupName,
        templates: [],
      };
      groups.set(row.groupId, group);
      if (row.templateId && row.templateName) {
        group.templates.push({ id: row.templateId, name: row.templateName });
      }
    }
    return {
      groups: [...groups.values()],
      catchAllName: owner?.catchAllName ?? null,
    };
  }

  async listChurchTemplates(
    input: ListChurchEventTemplatesInput,
  ): Promise<EventGroupTemplate[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    return db
      .select({ id: eventTemplate.id, name: eventTemplate.name })
      .from(eventTemplate)
      .where(
        withChurchIsolation({ table: eventTemplate, churchId: input.churchId }),
      )
      .orderBy(asc(sql`lower(${eventTemplate.name})`), asc(eventTemplate.id));
  }

  async replaceSetup(input: ReplaceEventGroupSetupInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    const { churchId, ministryId } = input;
    // The Ministry row serializes concurrent saves: the last one wins whole.
    await db
      .update(ministry)
      .set({ eventGroupCatchAllName: input.catchAllName })
      .where(
        and(
          eq(ministry.id, ministryId),
          withChurchIsolation({ table: ministry, churchId }),
        ),
      );
    await db
      .delete(eventGroup)
      .where(
        and(
          eq(eventGroup.ministryId, ministryId),
          withChurchIsolation({ table: eventGroup, churchId }),
        ),
      );
    if (input.groups.length === 0) return;
    const inserted = await db
      .insert(eventGroup)
      .values(
        input.groups.map((group, position) => ({
          churchId,
          ministryId,
          name: group.name,
          position,
        })),
      )
      .returning({ id: eventGroup.id, position: eventGroup.position });
    const links = inserted.flatMap((row) =>
      (input.groups[row.position]?.templateIds ?? []).map(
        (eventTemplateId, position) => ({
          churchId,
          ministryId,
          groupId: row.id,
          eventTemplateId,
          position,
        }),
      ),
    );
    if (links.length > 0) await db.insert(eventGroupTemplate).values(links);
  }
}
