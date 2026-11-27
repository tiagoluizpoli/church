import type { role } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type RoleRow = InferSelectModel<typeof role>;
