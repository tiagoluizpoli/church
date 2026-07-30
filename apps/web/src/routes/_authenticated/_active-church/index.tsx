import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_active-church/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});
