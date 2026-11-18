import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { type FormEvent, useEffect, useId, useState } from 'react';
import type { CycleFormState } from './planning-admin.types';
import {
  CYCLE_NAME_MAX_LENGTH,
  canCreateCycle,
  conflictingCyclesOf,
  isCycleNameTooLong,
  isCycleRangeReversed,
  outsideEventsOf,
  suggestCycleName,
} from './planning-admin.utils';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatCalendarDateOnly,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

export type CycleFormValues = CycleFormState;

export interface CycleFormSubmitInput {
  /** The name is already trimmed. */
  values: CycleFormValues;
}

export interface CycleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  /** Pre-fills an edit; a given name counts as authored, never re-suggested. */
  initialValues?: CycleFormValues;
  /** Resolve to finish; reject to keep the dialog open with the error shown.
   * The caller closes the dialog and owns navigation and cache refresh. */
  onSubmit: (input: CycleFormSubmitInput) => Promise<void>;
}

interface FormState {
  values: CycleFormValues;
  nameAuthored: boolean;
}

interface SubmitFailure {
  message: string;
  conflicts: string[];
  /** Every Event an edited range would exclude, each one named. */
  outsideEvents: string[];
}

interface InitialFormInput {
  initialValues: CycleFormValues | undefined;
}

function initialForm({ initialValues }: InitialFormInput): FormState {
  return {
    values: initialValues ?? { name: '', startDate: '', endDate: '' },
    nameAuthored: initialValues !== undefined,
  };
}

/** The New/Edit Cycle form over a dialog (drawer on small screens). It owns
 * its draft, validation and failure display; persistence is the caller's. */
export function CycleFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialValues,
  onSubmit,
}: CycleFormDialogProps) {
  const formId = useId();
  const { churchTimezone } = useTimezone();
  const [form, setForm] = useState<FormState>(() =>
    initialForm({ initialValues }),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm({ initialValues }));
      setFailure(null);
    }
  }, [open, initialValues]);

  // The suggestion is derived, so it follows the start month and the locale
  // until the admin writes a name of their own.
  const cycleForm: CycleFormValues = {
    ...form.values,
    name: form.nameAuthored
      ? form.values.name
      : suggestCycleName({
          startDate: form.values.startDate,
          locale: getLocale(),
        }),
  };
  const nameTooLong = isCycleNameTooLong({ cycleForm });
  const rangeReversed = isCycleRangeReversed({ cycleForm });
  const canSubmit = canCreateCycle({ cycleForm }) && !pending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setFailure(null);
    try {
      await onSubmit({
        values: { ...cycleForm, name: cycleForm.name.trim() },
      });
    } catch (error) {
      const message = requestErrorMessage(error);
      setFailure({
        message,
        conflicts: conflictingCyclesOf({ error }).map((conflict) =>
          m.cycles_form_conflict_item({
            name: conflict.name,
            startDate: formatCalendarDateOnly({ value: conflict.startDate }),
            endDate: formatCalendarDateOnly({ value: conflict.endDate }),
          }),
        ),
        outsideEvents: outsideEventsOf({ error }).map((outside) =>
          m.cycles_form_outside_event_item({
            title: outside.title,
            range: formatInstantRangeOf({
              start: outside.start,
              end: outside.end,
              timeZone: churchTimezone,
            }),
          }),
        ),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveFormSurface
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {m.cycles_form_cancel()}
          </Button>
          <Button
            type="submit"
            form={formId}
            data-testid="create-cycle-button"
            disabled={!canSubmit}
          >
            {pending ? m.cycles_form_submit_pending() : submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <Label htmlFor="cycle-name">{m.cycles_form_name()}</Label>
          <Input
            id="cycle-name"
            data-testid="cycle-name-input"
            value={cycleForm.name}
            aria-invalid={nameTooLong}
            aria-describedby={nameTooLong ? 'cycle-name-error' : undefined}
            onChange={(event) =>
              setForm((current) => ({
                values: { ...current.values, name: event.target.value },
                nameAuthored: true,
              }))
            }
          />
          {nameTooLong ? (
            <p id="cycle-name-error" className="text-destructive text-sm">
              {m.cycles_form_name_too_long({ max: CYCLE_NAME_MAX_LENGTH })}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cycle-start-date">{m.cycles_form_start()}</Label>
            <DatePickerField
              id="cycle-start-date"
              data-testid="cycle-start-date-input"
              value={cycleForm.startDate}
              onChange={(date) =>
                setForm((current) => ({
                  ...current,
                  values: { ...current.values, startDate: date },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cycle-end-date">{m.cycles_form_end()}</Label>
            <DatePickerField
              id="cycle-end-date"
              data-testid="cycle-end-date-input"
              value={cycleForm.endDate}
              onChange={(date) =>
                setForm((current) => ({
                  ...current,
                  values: { ...current.values, endDate: date },
                }))
              }
            />
          </div>
        </div>
        {rangeReversed ? (
          <p role="alert" className="text-destructive text-sm">
            {m.error_invalid_date_range()}
          </p>
        ) : null}
        {failure ? (
          <div
            role="alert"
            className="text-destructive text-sm"
            data-testid="cycle-create-error"
          >
            {failure.message}
            {failure.conflicts.length > 0
              ? ` ${m.cycles_form_conflicts({ conflicts: failure.conflicts.join(', ') })}`
              : null}
            {failure.outsideEvents.length > 0 ? (
              <>
                {` ${m.cycles_form_outside_events()}`}
                <ul className="list-disc ps-5">
                  {failure.outsideEvents.map((outside, index) => (
                    // Two Events may share a title and time; order is stable.
                    // biome-ignore lint/suspicious/noArrayIndexKey: display-only list rebuilt per failure
                    <li key={index}>{outside}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </ResponsiveFormSurface>
  );
}
