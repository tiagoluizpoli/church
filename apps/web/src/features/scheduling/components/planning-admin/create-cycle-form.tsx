import { useCreateCycleCard } from './planning-admin-context';
import { DatePickerField } from '@/components/date-picker-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateCycleFormProps {
  submitButtonClassName?: string;
  /** Skip the built-in submit button when a parent (e.g. a dialog/drawer
   * footer) owns Cancel/Submit placement instead — see
   * `routes/scheduling/planning-cycles/new.tsx`. */
  hideSubmitButton?: boolean;
}

export function CreateCycleForm({
  submitButtonClassName,
  hideSubmitButton = false,
}: CreateCycleFormProps) {
  const {
    cycleForm,
    cycleErrorMessage,
    canCreateCycle,
    createCyclePending,
    handleCycleNameChange,
    handleCycleStartDateChange,
    handleCycleEndDateChange,
    handleCreateCycle,
  } = useCreateCycleCard();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="cycle-name">Name</Label>
        <Input
          id="cycle-name"
          data-testid="cycle-name-input"
          value={cycleForm.name}
          onChange={(event) =>
            handleCycleNameChange({ name: event.target.value })
          }
          placeholder="August 2026"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cycle-start-date">Start date</Label>
          <DatePickerField
            id="cycle-start-date"
            data-testid="cycle-start-date-input"
            value={cycleForm.startDate}
            onChange={(date) => handleCycleStartDateChange({ date })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cycle-end-date">End date</Label>
          <DatePickerField
            id="cycle-end-date"
            data-testid="cycle-end-date-input"
            value={cycleForm.endDate}
            onChange={(date) => handleCycleEndDateChange({ date })}
          />
        </div>
      </div>
      {cycleErrorMessage ? (
        <p
          className="text-destructive text-sm"
          data-testid="cycle-create-error"
        >
          {cycleErrorMessage}
        </p>
      ) : null}
      {hideSubmitButton ? null : (
        <Button
          type="button"
          data-testid="create-cycle-button"
          className={submitButtonClassName}
          disabled={!canCreateCycle || createCyclePending}
          onClick={handleCreateCycle}
        >
          {createCyclePending ? 'Creating…' : 'Create cycle'}
        </Button>
      )}
    </div>
  );
}
