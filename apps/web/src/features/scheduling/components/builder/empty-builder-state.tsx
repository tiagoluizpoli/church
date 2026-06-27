import { Button } from '@church/ui/components/button';
import { CalendarPlus, Plus } from 'lucide-react';

interface EmptyBuilderStateProps {
  onAutoGenerate: () => void;
  onAddManually: () => void;
}

export function EmptyBuilderState({
  onAutoGenerate,
  onAddManually,
}: EmptyBuilderStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center"
      data-testid="empty-builder-state"
    >
      <p className="text-muted-foreground text-sm">
        This event has no time slots yet.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={onAutoGenerate}>
          <CalendarPlus className="mr-1 size-4" /> Auto-generate slots
        </Button>
        <Button type="button" variant="outline" onClick={onAddManually}>
          <Plus className="mr-1 size-4" /> Add slot manually
        </Button>
      </div>
    </div>
  );
}
