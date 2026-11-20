import type { CycleSummary } from './planning-admin.types';
import { cycleStateLabel, stateBadgeProps } from './planning-admin.utils';
import { Badge } from '@/components/ui/badge';

interface CycleStateBadgeProps {
  state: CycleSummary['state'];
  testId?: string;
}

/** A Cycle's state, the same wherever it shows: list rows and the cycle header. */
export function CycleStateBadge({ state, testId }: CycleStateBadgeProps) {
  return (
    <Badge data-testid={testId} {...stateBadgeProps({ state })}>
      {cycleStateLabel({ state })}
    </Badge>
  );
}
