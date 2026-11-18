import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/roles',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/ministries/$ministryId/operational',
      params,
      replace: true,
    });
  },
});
