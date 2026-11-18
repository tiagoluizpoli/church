import { DomainError } from '@church/core';

export class SwapRequestUnpublishedError extends DomainError {
  readonly code = 'SWAP_REQUEST_UNPUBLISHED' as const;
  constructor() {
    super('A swap request needs a published Assignment');
  }
}

export class SwapRequestShiftStartedError extends DomainError {
  readonly code = 'SWAP_REQUEST_SHIFT_STARTED' as const;
  constructor() {
    super('The Shift has started; a swap request can no longer be raised');
  }
}

export class SwapRequestAlreadyOpenError extends DomainError {
  readonly code = 'SWAP_REQUEST_ALREADY_OPEN' as const;
  constructor() {
    super('This Assignment already has an open swap request');
  }
}

export class SwapRequestNotOpenError extends DomainError {
  readonly code = 'SWAP_REQUEST_NOT_OPEN' as const;
  constructor() {
    super('The swap request is already closed');
  }
}

interface SwapRequestNoteTooLongInput {
  maxLength: number;
}

export class SwapRequestNoteTooLongError extends DomainError {
  readonly code = 'SWAP_REQUEST_NOTE_TOO_LONG' as const;
  readonly maxLength: number;
  constructor({ maxLength }: SwapRequestNoteTooLongInput) {
    super(`The note is longer than ${maxLength} characters`);
    this.maxLength = maxLength;
  }
}
