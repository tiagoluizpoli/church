import type { ValidationReason } from './validation-rule-error';
import { ValidationRuleError } from './validation-rule-error';

/** The reasons an Event and its EventTimeBlocks can fail final-graph validation. */
export type EventGraphRuleReason = Extract<
  ValidationReason,
  | 'INVALID_EVENT_BOUNDS'
  | 'EVENT_TIME_BLOCK_OUT_OF_BOUNDS'
  | 'EVENT_TIME_BLOCK_LABEL_REQUIRED'
  | 'DUPLICATE_EVENT_TIME_BLOCK_LABEL'
  | 'DUPLICATE_EVENT_TIME_BLOCK_ID'
>;

export interface EventGraphRuleErrorInput {
  reason: EventGraphRuleReason;
  /** The refused request field, e.g. `end` or `eventTimeBlocks.1.label`. */
  field: string;
}

/** A proposed Event graph broke a field-level rule; `field` names where. */
export class EventGraphRuleError extends ValidationRuleError {
  readonly reason: EventGraphRuleReason;
  readonly field: string;

  constructor({ reason, field }: EventGraphRuleErrorInput) {
    super(`Event graph refused: ${reason} at ${field}`);
    this.reason = reason;
    this.field = field;
  }
}
