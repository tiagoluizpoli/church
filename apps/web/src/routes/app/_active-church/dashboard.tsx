import { createFileRoute, redirect } from '@tanstack/react-router';
import { homeSearchSchema } from '@/features/home/lib/home-search';

// Compatibility redirect for old dashboard links; Home (`/app`) is the page.
export const Route = createFileRoute('/app/_active-church/dashboard')({
  validateSearch: (search) => homeSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/app', search, replace: true });
  },
});
