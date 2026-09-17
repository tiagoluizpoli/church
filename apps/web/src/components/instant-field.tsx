import {
  type Instant,
  parseCalendarDay,
  today,
  toInstant,
  toTimeOfDay,
} from '@church/time';
import { DatePickerField } from '@/components/date-picker-field';
import { TimeOfDayField } from '@/components/time-of-day-field';

export interface InstantFieldProps {
  idPrefix: string;
  value: Instant;
  timeZone: string;
  onChange: (instant: Instant) => void;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'data-testid'?: string;
}

/**
 * CalendarDay + TimeOfDay entry for a single Instant, combined through the
 * Church Timezone (`toInstant`) — replaces a native `datetime-local` input.
 * Reading and writing both funnel through the Church Timezone, so the pair
 * always names the same moment the leader sees, regardless of the browser's
 * ambient zone (ADR-0003).
 */
export function InstantField({
  idPrefix,
  value,
  timeZone,
  onChange,
  disabled,
  'aria-labelledby': ariaLabelledby,
  'data-testid': dataTestId,
}: InstantFieldProps) {
  const day = today({ instant: value, timeZone });
  const time = toTimeOfDay({ instant: value, timeZone });

  return (
    <div className="flex gap-2">
      <DatePickerField
        id={`${idPrefix}-date`}
        value={day}
        disabled={disabled}
        data-testid={dataTestId ? `${dataTestId}-date` : undefined}
        onChange={(nextDayValue) =>
          onChange(
            toInstant({
              day: parseCalendarDay({ value: nextDayValue }),
              time,
              timeZone,
            }),
          )
        }
      />
      <TimeOfDayField
        id={`${idPrefix}-time`}
        value={time}
        disabled={disabled}
        aria-labelledby={ariaLabelledby}
        data-testid={dataTestId ? `${dataTestId}-time` : undefined}
        onChange={(nextTime) =>
          onChange(toInstant({ day, time: nextTime, timeZone }))
        }
      />
    </div>
  );
}
