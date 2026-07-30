import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/',
)({
  beforeLoad: () => {
    throw redirect({ to: '/scheduling/planning-cycles' });
  },
});
