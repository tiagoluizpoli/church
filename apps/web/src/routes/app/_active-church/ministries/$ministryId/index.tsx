import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/app/_active-church/ministries/$ministryId/',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/app/ministries/$ministryId/operational',
      params,
      replace: true,
    });
  },
});
