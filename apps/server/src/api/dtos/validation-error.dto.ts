import { z } from 'zod';
import { VALIDATION_REASONS } from '../../domain/errors/validation-rule-error';

/** The 422 envelope: a domain rule names its `reason`; request validation lists `issues`. */
export const validationErrorResponseSchema = z.object({
  error: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  reason: z.enum(VALIDATION_REASONS).optional(),
  issues: z.array(z.unknown()).optional(),
});
