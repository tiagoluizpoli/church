import type { eventTemplate } from '@church/db';
import type { CreateEventTemplateInput } from '@/domain/contracts/infrastructure/event-template.repository';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface MapTemplateGraphsInput {
  templates: (typeof eventTemplate.$inferSelect)[];
  tx?: CreateEventTemplateInput['tx'];
}

export interface DrizzleEventTemplateRepositoryInput {
  db: AnyDrizzleDb;
}
