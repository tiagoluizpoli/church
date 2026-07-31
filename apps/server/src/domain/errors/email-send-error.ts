import { DomainError } from '@church/core';

export interface EmailSendErrorInput {
  message: string;
  retryable: boolean;
}

/**
 * Thrown by an `EmailSender` adapter. `retryable` distinguishes a transient
 * failure (worth a backoff retry) from a terminal one (hard bounce, invalid
 * recipient, bad request) that must not be retried.
 */
export class EmailSendError extends DomainError {
  readonly code = 'EMAIL_SEND_FAILED' as const;
  readonly retryable: boolean;

  constructor({ message, retryable }: EmailSendErrorInput) {
    super(message);
    this.retryable = retryable;
  }
}
