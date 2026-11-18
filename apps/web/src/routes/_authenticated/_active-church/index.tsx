import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/features/home/components/home-page';
import { homeSearchSchema } from '@/features/home/lib/home-search';

export const Route = createFileRoute('/_authenticated/_active-church/')({
  validateSearch: (search) => homeSearchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  return <HomePage search={Route.useSearch()} />;
}
