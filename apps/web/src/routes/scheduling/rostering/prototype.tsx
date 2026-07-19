import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/workspace-page';
import { CycleBoardPrototype } from '@/features/scheduling/components/cycle-board-prototype/cycle-board';

interface PrototypeSearch {
  variant: string;
}

export const Route = createFileRoute('/scheduling/rostering/prototype')({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: typeof search.variant === 'string' ? search.variant : 'A',
  }),
  component: CycleBoardPrototypeRoute,
});

function CycleBoardPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorkspacePage>
      <div className="w-full px-4 py-6 pb-12 sm:px-6 lg:px-10">
        <div className="mb-5 rounded-lg border border-primary/40 border-dashed bg-primary/5 px-4 py-3 text-muted-foreground text-xs">
          <strong className="text-foreground">PROTOTYPE ONLY</strong> · Cycle
          board reference for Event Builder implementation. Data and actions are
          mocked. Flip rail designs with the bar at the bottom (or ← / →).
        </div>
        <CycleBoardPrototype
          variantKey={variant}
          onVariantChange={(next) =>
            navigate({ search: { variant: next }, replace: true })
          }
        />
      </div>
    </WorkspacePage>
  );
}
