import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/ministries/$ministryId/sectors',
      params,
      replace: true,
    });
  },
});
