import type * as schema from '@church/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type AnyDrizzleDb = NodePgDatabase<typeof schema>;
