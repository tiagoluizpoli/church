/**
 * Base abstract class for all domain-specific errors.
 * Ensures that the error name matches the class name and properly captures the stack trace.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
