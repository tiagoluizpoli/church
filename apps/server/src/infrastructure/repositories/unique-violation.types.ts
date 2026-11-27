export interface PostgresErrorFields {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

export interface IsUniqueViolationInput {
  error: unknown;
  constraint: string;
}

export interface IsConstraintViolationInput extends IsUniqueViolationInput {
  code: string;
}

export interface IsChurchSlugConflictInput {
  error: unknown;
}
