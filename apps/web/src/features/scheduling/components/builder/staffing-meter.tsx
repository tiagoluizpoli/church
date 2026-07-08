import { Badge } from '@/components/ui/badge';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface StaffingMeterProps {
  fillRatio: number; // 0–1
  variant: 'event' | 'slot';
}

function colorFor(fillRatio: number): {
  bar: string;
  badge: string;
} {
  if (fillRatio >= 1) {
    return { bar: 'bg-green-600', badge: 'bg-green-700 text-white' };
  }
  if (fillRatio >= 0.5) {
    return { bar: 'bg-yellow-500', badge: 'bg-yellow-500 text-black' };
  }
  return { bar: 'bg-red-600', badge: 'bg-red-600 text-white' };
}

export function StaffingMeter({ fillRatio, variant }: StaffingMeterProps) {
  const pct = Math.round(Math.min(Math.max(fillRatio, 0), 1) * 100);
  const colors = colorFor(fillRatio);

  if (variant === 'slot') {
    return (
      <Badge
        className={cn('tabular-nums', colors.badge)}
        data-testid="staffing-meter-slot"
      >
        {pct}%
      </Badge>
    );
  }

  return (
    <div className="w-48" data-testid="staffing-meter-event">
      <Progress value={pct}>
        <ProgressLabel>Staffing</ProgressLabel>
        <ProgressValue />
        <ProgressTrack>
          <ProgressIndicator className={colors.bar} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
