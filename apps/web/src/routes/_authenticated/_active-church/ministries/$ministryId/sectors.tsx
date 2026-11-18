import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/sectors',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/ministries/$ministryId/operational',
      params,
      replace: true,
    });
  },
});
