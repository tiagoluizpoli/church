import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

/** The id an N7 swap request alert (bell or email) deep-links with. */
const prepareSearchSchema = z.object({ swapRequest: z.string().optional() });

/** The Schedule list with no block selected; `_prepare` renders the list. */
export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/_prepare/',
)({
  validateSearch: prepareSearchSchema,
});
