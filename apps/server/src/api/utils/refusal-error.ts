import type { RefusalCode } from './error-table.types';
import type { RefusalErrorInput } from './refusal-error.types';

/**
 * A controller's refusal, thrown so nothing runs after it. The global error
 * handler answers it as `refuse` does: `{ error, message }` in the request
 * locale, with the code's status from the error table.
 */
export class RefusalError extends Error {
  readonly code: RefusalCode;

  constructor({ code }: RefusalErrorInput) {
    super(code);
    this.name = 'RefusalError';
    this.code = code;
  }
}
