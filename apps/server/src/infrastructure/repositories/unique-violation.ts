/** PostgreSQL `unique_violation` SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';
/** PostgreSQL `exclusion_violation` SQLSTATE. */
export const PG_EXCLUSION_VIOLATION = '23P01';

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

export interface IsConstraintViolationInput extends IsUniqueViolationInput {
  code: string;
}

/**
 * True when `error`, or an error it wraps on `.cause`, carries SQLSTATE `code`
 * for `constraint`. drizzle-orm wraps the raw `pg` error in a
 * `DrizzleQueryError`.
 */
export function isConstraintViolation({
  error,
  code,
  constraint,
}: IsConstraintViolationInput): boolean {
  if (!hasPostgresErrorFields(error)) return false;
  return (
    (error.code === code && error.constraint === constraint) ||
    isConstraintViolation({ error: error.cause, code, constraint })
  );
}

export function isUniqueViolation({
  error,
  constraint,
}: IsUniqueViolationInput): boolean {
  return isConstraintViolation({
    error,
    code: PG_UNIQUE_VIOLATION,
    constraint,
  });
}
