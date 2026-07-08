import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface BackgroundRefreshIndicatorProps {
  visible: boolean;
  onDismiss: () => void;
}

export function BackgroundRefreshIndicator({
  visible,
  onDismiss,
}: BackgroundRefreshIndicatorProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex items-center justify-end">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <Badge variant="secondary">
          <RefreshCw className="mr-1 size-3" />
          Updated in background
        </Badge>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
