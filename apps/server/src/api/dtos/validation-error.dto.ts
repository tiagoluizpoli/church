import { z } from 'zod';
import { VALIDATION_REASONS } from '../../domain/errors/validation-rule-error';

/** The 422 envelope: a domain rule names its `reason`; request validation lists `issues`. */
export const validationErrorResponseSchema = z.object({
  error: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  reason: z.enum(VALIDATION_REASONS).optional(),
  /** The refused request field of a field-level rule, e.g. `eventTimeBlocks.1.label`. */
  field: z.string().optional(),
  issues: z.array(z.unknown()).optional(),
});
