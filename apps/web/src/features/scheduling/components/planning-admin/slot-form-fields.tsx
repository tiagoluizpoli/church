import { timePartOf, withUpdatedTime } from './planning-admin.utils';
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
        <Label htmlFor={`${idPrefix}-start`}>Start</Label>
        <Input
          id={`${idPrefix}-start`}
          type={values.isMultiDayEvent ? 'datetime-local' : 'time'}
          value={
            values.isMultiDayEvent
              ? values.startTimeLocal
              : timePartOf({ value: values.startTimeLocal })
          }
          onChange={(e) =>
            onChange({
              ...values,
              startTimeLocal: values.isMultiDayEvent
                ? e.target.value
                : withUpdatedTime({
                    value: values.startTimeLocal,
                    time: e.target.value,
                  }),
            })
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-end`}>End</Label>
        <Input
          id={`${idPrefix}-end`}
          type={values.isMultiDayEvent ? 'datetime-local' : 'time'}
          value={
            values.isMultiDayEvent
              ? values.endTimeLocal
              : timePartOf({ value: values.endTimeLocal })
          }
          onChange={(e) =>
            onChange({
              ...values,
              endTimeLocal: values.isMultiDayEvent
                ? e.target.value
                : withUpdatedTime({
                    value: values.endTimeLocal,
                    time: e.target.value,
                  }),
            })
          }
        />
      </div>
    </div>
  );
}
