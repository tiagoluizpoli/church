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
  /** Shows only the time; the day stays the value's own. */
  dateHidden?: boolean;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
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
  dateHidden = false,
  'aria-labelledby': ariaLabelledby,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  'data-testid': dataTestId,
}: InstantFieldProps) {
  const day = today({ instant: value, timeZone });
  const time = toTimeOfDay({ instant: value, timeZone });

  return (
    // The date gives way (min-w-0) so a narrow column never pushes the time out.
    <div
      className={
        dateHidden ? 'w-28' : 'grid grid-cols-[minmax(0,1fr)_7rem] gap-2'
      }
    >
      {dateHidden ? null : (
        <div className="min-w-0">
          <DatePickerField
            id={`${idPrefix}-date`}
            value={day}
            aria-labelledby={ariaLabelledby}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedby}
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
        </div>
      )}
      <TimeOfDayField
        id={`${idPrefix}-time`}
        value={time}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
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
