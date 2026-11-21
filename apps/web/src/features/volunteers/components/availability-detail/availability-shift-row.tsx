import { m } from '@church/i18n/messages';
import { CircleX, Lock } from 'lucide-react';
import { SECONDARY_TONE } from './style';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatShiftTimes } from '@/features/volunteers/lib/availability-format';
import type { CheckShift } from '@/features/volunteers/lib/unavailable-shifts';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export interface AvailabilityShiftRowProps {
  shift: CheckShift;
  available: boolean;
  /** Stable id for the switch and its note. */
  id: string;
  disabled: boolean;
  onToggle: () => void;
}

/** One Shift: title, time and note, and its answer flush right. */
export function AvailabilityShiftRow({
  shift,
  available,
  id,
  disabled,
  onToggle,
}: AvailabilityShiftRowProps) {
  const { churchTimezone } = useTimezone();
  const noteId = `${id}-note`;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 md:min-h-10 md:py-1.5">
      {/* Desktop reads one line: title · time · note. */}
      <div className="min-w-0 space-y-0.5 md:flex md:items-baseline md:gap-2 md:space-y-0 md:whitespace-nowrap">
        <h3 className="break-words font-medium text-base md:truncate md:text-sm">
          {shift.eventTitle}
        </h3>
        <p className={cn('text-sm md:truncate md:text-xs', SECONDARY_TONE)}>
          <span className="tabular-nums">
            {formatShiftTimes({ shift, timeZone: churchTimezone })}
          </span>
          {shift.label ? (
            <>
              <span aria-hidden> · </span>
              <span id={noteId}>{shift.label}</span>
            </>
          ) : null}
        </p>
      </div>
      {shift.published ? (
        <Badge
          variant="secondary"
          className={cn(
            'h-7 shrink-0 px-2.5 text-sm md:h-5 md:px-2 md:text-xs',
            shift.assigned
              ? 'bg-green-600/10 text-green-700 dark:text-green-400'
              : SECONDARY_TONE,
          )}
        >
          <Lock aria-hidden />
          {shift.assigned
            ? m.availability_detail_locked_assigned()
            : m.availability_detail_locked_unassigned()}
        </Badge>
      ) : shift.answerable ? (
        <label
          htmlFor={id}
          className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm md:min-h-7 md:gap-2 md:text-xs"
        >
          {/* Desktop names only the exception; the switch carries "available". */}
          {available ? (
            <span aria-hidden className={cn('md:hidden', SECONDARY_TONE)}>
              {m.availability_detail_available()}
            </span>
          ) : (
            <span aria-hidden className="flex items-center gap-1.5 font-medium">
              <CircleX className="size-4 shrink-0 text-destructive" />
              {m.availability_detail_unavailable()}
            </span>
          )}
          <Switch
            aria-label={m.availability_detail_switch_name({
              shift: shift.eventTitle,
              time: formatInstantRangeOf({
                start: shift.startTime,
                end: shift.endTime,
                timeZone: churchTimezone,
              }),
            })}
            aria-describedby={shift.label ? noteId : undefined}
            id={id}
            disabled={disabled}
            checked={available}
            onCheckedChange={onToggle}
          />
        </label>
      ) : (
        // Over or read-only: the answer as it stands, nothing left to change.
        <Badge
          variant="secondary"
          className={cn(
            'h-7 shrink-0 px-2.5 text-sm md:h-5 md:px-2 md:text-xs',
            SECONDARY_TONE,
          )}
        >
          {available
            ? m.availability_detail_available()
            : m.availability_detail_unavailable()}
        </Badge>
      )}
    </li>
  );
}
