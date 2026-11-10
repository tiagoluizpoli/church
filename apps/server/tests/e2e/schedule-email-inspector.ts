import { getE2eDatabaseUrl } from '@church/db/e2e-database-url';
import { and, eq, sql } from 'drizzle-orm';

async function main(): Promise<void> {
  const churchId = process.argv[2];
  if (!churchId) throw new Error('Church ID is required');
  getE2eDatabaseUrl();
  const { db, outboxMessage } = await import('@church/db');
  try {
    const rows = await db
      .select({ email: outboxMessage.emailRequest })
      .from(outboxMessage)
      .where(
        and(
          eq(outboxMessage.churchId, churchId),
          sql`${outboxMessage.payload}->>'kind' IN ('schedule_published', 'schedule_updated')`,
        ),
      );
    console.log(JSON.stringify(rows.map((row) => row.email).filter(Boolean)));
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
