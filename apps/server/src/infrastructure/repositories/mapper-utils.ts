import { DomainError } from '@church/core';

export class MappingError extends DomainError {
  constructor(field: string, value: unknown) {
    super(`Invalid DB enum value for ${field}: ${String(value)}`);
  }
}

export function assertEnum<T extends string>({
  field,
  value,
  valid,
}: {
  field: string;
  value: string | null | undefined;
  valid: readonly T[];
}): T {
  if (value != null && (valid as readonly string[]).includes(value)) {
    return value as T;
  }

  throw new MappingError(field, value);
}
