import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Operator-edited runtime configuration, one row per `code`. Edited directly
 * in the environment database; read when needed, never cached. The only code
 * is `email_delivery_mode`.
 */
export const runtimeConfiguration = pgTable('runtime_configuration', {
  code: text('code').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
