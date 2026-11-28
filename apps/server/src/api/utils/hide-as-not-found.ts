import type { HideAsNotFoundInput } from './hide-as-not-found.types';
import { RefusalError } from './refusal-error';

/**
 * Runs the operation and answers any of the given errors as NOT_FOUND, so an
 * object the caller may not see is indistinguishable from a missing one. A
 * plain NotFoundError needs no listing: the global handler already answers
 * it with the same body.
 */
export async function hideAsNotFound<T>({
  errors,
  operation,
}: HideAsNotFoundInput<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (errors.some((hidden) => error instanceof hidden)) {
      throw new RefusalError({ code: 'NOT_FOUND' });
    }
    throw error;
  }
}
