import { Badge } from '@church/ui/components/badge';
import { Card, CardContent } from '@church/ui/components/card';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';

export interface AvailabilityCheckListProps {
  checks: ListAvailabilityChecks200ChecksItem[];
  selectedCheckId: string | null;
  onSelectCheck: (checkId: string) => void;
}

interface AvailabilityCheckStateBadgeProps {
  state: ListAvailabilityChecks200ChecksItem['state'];
}

function AvailabilityCheckStateBadge({
  state,
}: AvailabilityCheckStateBadgeProps) {
  return (
    <Badge variant={state === 'confirmed' ? 'default' : 'outline'}>
      {state === 'confirmed' ? 'Confirmed' : 'Pending'}
    </Badge>
  );
}

export function AvailabilityCheckList({
  checks,
  selectedCheckId,
  onSelectCheck,
}: AvailabilityCheckListProps) {
  if (checks.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-muted-foreground text-sm">
          No availability checks yet. Your leader will notify you once one is
          fired.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="availability-check-list">
      {checks.map((check) => (
        <button
          key={check.id}
          type="button"
          data-testid="availability-check-card"
          onClick={() => onSelectCheck(check.id)}
          className={`w-full border p-4 text-left transition-colors hover:bg-accent ${
            selectedCheckId === check.id ? 'border-primary bg-accent' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">{check.ministryName}</div>
              <div className="text-muted-foreground text-sm">
                {check.planningCycleName}
              </div>
              <div className="text-muted-foreground text-xs">
                {check.unavailableShiftCount} of {check.totalShiftCount} shifts
                marked unavailable
              </div>
            </div>
            <AvailabilityCheckStateBadge state={check.state} />
          </div>
        </button>
      ))}
    </div>
  );
}
