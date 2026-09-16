import { parseTimeOfDay, type TimeOfDay } from '@church/time';
import { timePartOf, withUpdatedTime } from './planning-admin.utils';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SlotFormValues {
  label: string;
  startTimeLocal: string;
  endTimeLocal: string;
  isMultiDayEvent: boolean;
}

export interface SlotFormFieldsProps {
  idPrefix: string;
  values: SlotFormValues;
  labelPlaceholder?: string;
  onChange: (values: SlotFormValues) => void;
}

/**
 * Label/Start/End fields shared by the Edit-slot and Add-slot dialogs,
 * including the datetime-local-vs-time branching that depends on whether the
 * slot's parent event spans a single calendar day or several
 * (`isMultiDayEvent`, see `planning-admin.utils.ts`).
 */
export function SlotFormFields({
  idPrefix,
  values,
  labelPlaceholder,
  onChange,
}: SlotFormFieldsProps) {
  const isInvalidRange = values.startTimeLocal >= values.endTimeLocal;

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
          <Input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={values.startTimeLocal}
            onChange={(e) =>
              onChange({ ...values, startTimeLocal: e.target.value })
            }
          />
        ) : (
          <TimeOfDayField
            id={`${idPrefix}-start`}
            aria-labelledby={`${idPrefix}-start-label`}
            data-testid={`${idPrefix}-start-time-field`}
            value={parseTimeOfDay({
              value: timePartOf({ value: values.startTimeLocal }),
            })}
            onChange={(time: TimeOfDay) =>
              onChange({
                ...values,
                startTimeLocal: withUpdatedTime({
                  value: values.startTimeLocal,
                  time,
                }),
              })
            }
          />
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-end`} id={`${idPrefix}-end-label`}>
          End
        </Label>
        {values.isMultiDayEvent ? (
          <Input
            id={`${idPrefix}-end`}
            type="datetime-local"
            value={values.endTimeLocal}
            onChange={(e) =>
              onChange({ ...values, endTimeLocal: e.target.value })
            }
          />
        ) : (
          <TimeOfDayField
            id={`${idPrefix}-end`}
            aria-labelledby={`${idPrefix}-end-label`}
            data-testid={`${idPrefix}-end-time-field`}
            value={parseTimeOfDay({
              value: timePartOf({ value: values.endTimeLocal }),
            })}
            onChange={(time: TimeOfDay) =>
              onChange({
                ...values,
                endTimeLocal: withUpdatedTime({
                  value: values.endTimeLocal,
                  time,
                }),
              })
            }
          />
        )}
        {isInvalidRange ? (
          <p className="text-destructive text-xs">End must be after start.</p>
        ) : null}
      </div>
    </div>
  );
}
