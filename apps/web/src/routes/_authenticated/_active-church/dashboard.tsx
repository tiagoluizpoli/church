import { createFileRoute, redirect } from '@tanstack/react-router';
import { homeSearchSchema } from '@/features/home/lib/home-search';

// Compatibility redirect for old dashboard links; Home (`/`) is the page.
export const Route = createFileRoute(
  '/_authenticated/_active-church/dashboard',
)({
  validateSearch: (search) => homeSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search, replace: true });
  },
});
