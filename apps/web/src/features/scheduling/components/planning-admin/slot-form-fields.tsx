import {
  type Instant,
  instantSpan,
  type TimeOfDay,
  today,
  toInstant,
  toTimeOfDay,
} from '@church/time';
import { InstantField } from '@/components/instant-field';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  describeSpan,
  isInvalidInstantRange,
} from '@/shared/utils/span-description';

export interface SlotFormValues {
  label: string;
  start: Instant;
  end: Instant;
  isMultiDayEvent: boolean;
}

export interface SlotFormFieldsProps {
  idPrefix: string;
  values: SlotFormValues;
  timeZone: string;
  labelPlaceholder?: string;
  onChange: (values: SlotFormValues) => void;
}

/**
 * Label/Start/End fields shared by the Edit-slot and Add-slot dialogs,
 * including the InstantField-vs-TimeOfDayField branching that depends on
 * whether the slot's parent event spans a single calendar day or several
 * (`isMultiDayEvent`, see `planning-admin.utils.ts`). Both branches combine
 * through the Church Timezone (`toInstant`/`toTimeOfDay`), so no reading here
 * depends on the browser's ambient zone (ADR-0003).
 */
export function SlotFormFields({
  idPrefix,
  values,
  timeZone,
  labelPlaceholder,
  onChange,
}: SlotFormFieldsProps) {
  const isInvalidRange = isInvalidInstantRange({
    start: values.start,
    end: values.end,
  });
  const span = isInvalidRange
    ? null
    : instantSpan({ start: values.start, end: values.end, timeZone });

  function updateTime(field: 'start' | 'end', time: TimeOfDay) {
    onChange({
      ...values,
      [field]: toInstant({
        day: today({ instant: values[field], timeZone }),
        time,
        timeZone,
      }),
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-label`}>Label</Label>
        <Input
          id={`${idPrefix}-label`}
          value={values.label}
          onChange={(e) => onChange({ ...values, label: e.target.value })}
          placeholder={labelPlaceholder}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-start`} id={`${idPrefix}-start-label`}>
          Start
        </Label>
        {values.isMultiDayEvent ? (
          <InstantField
            idPrefix={`${idPrefix}-start`}
            value={values.start}
            timeZone={timeZone}
            data-testid={`${idPrefix}-start`}
            aria-labelledby={`${idPrefix}-start-label`}
            onChange={(start) => onChange({ ...values, start })}
          />
        ) : (
          <TimeOfDayField
            id={`${idPrefix}-start`}
            aria-labelledby={`${idPrefix}-start-label`}
            data-testid={`${idPrefix}-start-time-field`}
            value={toTimeOfDay({ instant: values.start, timeZone })}
            onChange={(time) => updateTime('start', time)}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-end`} id={`${idPrefix}-end-label`}>
          End
        </Label>
        {values.isMultiDayEvent ? (
          <InstantField
            idPrefix={`${idPrefix}-end`}
            value={values.end}
            timeZone={timeZone}
            data-testid={`${idPrefix}-end`}
            aria-labelledby={`${idPrefix}-end-label`}
            onChange={(end) => onChange({ ...values, end })}
          />
        ) : (
          <TimeOfDayField
            id={`${idPrefix}-end`}
            aria-labelledby={`${idPrefix}-end-label`}
            data-testid={`${idPrefix}-end-time-field`}
            value={toTimeOfDay({ instant: values.end, timeZone })}
            onChange={(time) => updateTime('end', time)}
          />
        )}
        {isInvalidRange ? (
          <p className="text-destructive text-xs">End must be after start.</p>
        ) : span ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid={`${idPrefix}-span`}
          >
            {describeSpan({ span })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
