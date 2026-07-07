import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/scheduling/')({
  beforeLoad: () => {
    throw redirect({ to: '/scheduling/builder-events' });
  },
});
