import { DomainError } from '@church/core';

export interface TypstRenderErrorInput {
  reason: 'failed' | 'timeout';
}

/** A Typst render failed or was killed at its timeout; the diagnostic is logged. */
export class TypstRenderError extends DomainError {
  readonly code = 'TYPST_RENDER_FAILED' as const;
  readonly reason: TypstRenderErrorInput['reason'];

  constructor({ reason }: TypstRenderErrorInput) {
    super(`Typst render ${reason}`);
    this.reason = reason;
  }
}
