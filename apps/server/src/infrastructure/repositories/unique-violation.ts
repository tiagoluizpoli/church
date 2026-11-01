/** PostgreSQL `unique_violation` SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';

interface PostgresErrorFields {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

function hasPostgresErrorFields(value: unknown): value is PostgresErrorFields {
  return typeof value === 'object' && value !== null;
}

export interface IsUniqueViolationInput {
  error: unknown;
  constraint: string;
}

/**
 * True when `error`, or an error it wraps on `.cause`, violates `constraint`.
 * drizzle-orm wraps the raw `pg` error in a `DrizzleQueryError`.
 */
export function isUniqueViolation({
  error,
  constraint,
}: IsUniqueViolationInput): boolean {
  if (!hasPostgresErrorFields(error)) return false;
  return (
    (error.code === PG_UNIQUE_VIOLATION && error.constraint === constraint) ||
    isUniqueViolation({ error: error.cause, constraint })
  );
}
