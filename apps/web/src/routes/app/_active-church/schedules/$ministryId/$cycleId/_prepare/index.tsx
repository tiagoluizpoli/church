import { createFileRoute } from '@tanstack/react-router';

/** The Schedule list with no block selected; `_prepare` renders the list. */
export const Route = createFileRoute(
  '/app/_active-church/schedules/$ministryId/$cycleId/_prepare/',
)({});
