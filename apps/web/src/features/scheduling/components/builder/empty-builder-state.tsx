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
      <div className="space-y-1">
        <p className="text-sm">This event has no service slots yet.</p>
        <p className="text-muted-foreground text-sm">
          Most services use one slot for full event. Split into turns only when
          needed.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onAddManually}>
          <Plus className="mr-1 size-4" /> Use one slot for full event
        </Button>
        <Button type="button" onClick={onAutoGenerate}>
          <CalendarPlus className="mr-1 size-4" /> Split event into turns
        </Button>
      </div>
    </div>
  );
}
