import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { useCreateCycleCard } from './planning-admin-context';

export function CreateCycleCard() {
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
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Create cycle</CardTitle>
        <CardDescription>
          Cycles are church-wide and cannot overlap.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <Input
              id="cycle-start-date"
              data-testid="cycle-start-date-input"
              type="date"
              value={cycleForm.startDate}
              onChange={(event) =>
                handleCycleStartDateChange({ date: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cycle-end-date">End date</Label>
            <Input
              id="cycle-end-date"
              data-testid="cycle-end-date-input"
              type="date"
              value={cycleForm.endDate}
              onChange={(event) =>
                handleCycleEndDateChange({ date: event.target.value })
              }
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
        <Button
          type="button"
          data-testid="create-cycle-button"
          className="w-full justify-center sm:w-auto"
          disabled={!canCreateCycle || createCyclePending}
          onClick={handleCreateCycle}
        >
          {createCyclePending ? 'Creating…' : 'Create cycle'}
        </Button>
      </CardContent>
    </Card>
  );
}
