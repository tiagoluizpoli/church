import { m } from '@church/i18n/messages';
import { Badge } from '@/components/ui/badge';

/** Same label and variant as Planning's cancelled Event status. */
export function CancelledBadge() {
  return (
    <Badge variant="destructive" className="shrink-0">
      {m.event_status_cancelled()}
    </Badge>
  );
}
