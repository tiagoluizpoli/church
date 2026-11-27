export interface DrizzleTransactionContextInput {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle PgTransaction is a complex generic — any is intentional here
  tx: any;
}

export interface IDrizzleTransactionContext {
  readonly tx: DrizzleTransactionContextInput['tx'];
}
