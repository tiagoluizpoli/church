import type {
  IsChurchSlugConflictInput,
  IsConstraintViolationInput,
  IsUniqueViolationInput,
  PostgresErrorFields,
} from './unique-violation.types';

/** PostgreSQL `unique_violation` SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';
/** PostgreSQL `exclusion_violation` SQLSTATE. */
export const PG_EXCLUSION_VIOLATION = '23P01';

function hasPostgresErrorFields(value: unknown): value is PostgresErrorFields {
  return typeof value === 'object' && value !== null;
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

const ORGANIZATION_SLUG_UNIQUE = 'organization_slug_unique';
/** Raised by migration 0070's trigger: the slug is live or history of another Church. */
const CHURCH_SLUG_CLAIM = 'church_slug_claim';

/** True when a Church Slug write lost to another Church's live or given-up slug. */
export function isChurchSlugConflict({
  error,
}: IsChurchSlugConflictInput): boolean {
  return [ORGANIZATION_SLUG_UNIQUE, CHURCH_SLUG_CLAIM].some((constraint) =>
    isUniqueViolation({ error, constraint }),
  );
}
