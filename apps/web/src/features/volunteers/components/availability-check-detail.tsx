import {
  type AvailabilityMarkDraft,
  getShiftDate,
} from '../lib/availability-marks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  GetAvailabilityCheck200,
  GetAvailabilityCheck200ShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';

export interface AvailabilityCheckDetailProps {
  check: GetAvailabilityCheck200;
  markDraft: AvailabilityMarkDraft;
  onToggleShift: (shiftId: string) => void;
  onToggleWholeDay: (date: string) => void;
  onSaveMarks: () => void;
  onConfirm: () => void;
  isSavingMarks: boolean;
  isConfirming: boolean;
  overlapWarningVisible: boolean;
}

interface FormatShiftTimeRangeInput {
  start: string;
  end: string;
}

interface FormatShiftDateInput {
  date: string;
}

function formatShiftTimeRange({
  start,
  end,
}: FormatShiftTimeRangeInput): string {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const startDate = new Date(start);
  const endDate = new Date(end);

  return `${dateFormatter.format(startDate)} · ${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
}

function formatShiftDate({ date }: FormatShiftDateInput): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

interface ShiftAvailabilityRowProps {
  shift: GetAvailabilityCheck200ShiftsItem;
  isMarkedUnavailable: boolean;
  isWholeDayMarked: boolean;
  isEditable: boolean;
  onToggleShift: (shiftId: string) => void;
  onToggleWholeDay: (date: string) => void;
}

function ShiftAvailabilityRow({
  shift,
  isMarkedUnavailable,
  isWholeDayMarked,
  isEditable,
  onToggleShift,
  onToggleWholeDay,
}: ShiftAvailabilityRowProps) {
  const date = getShiftDate(shift);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border p-3"
      data-testid="shift-availability-row"
    >
      <div className="space-y-1">
        <div className="font-medium">{shift.eventTitle}</div>
        <div className="text-muted-foreground text-sm">
          {formatShiftTimeRange({ start: shift.startTime, end: shift.endTime })}
        </div>
        {shift.label ? (
          <div className="text-muted-foreground text-xs">{shift.label}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="mark-unavailable-toggle"
            checked={isMarkedUnavailable}
            disabled={!isEditable}
            onChange={() => onToggleShift(shift.shiftId)}
          />
          Unavailable
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="whole-day-toggle"
            checked={isWholeDayMarked}
            disabled={!isEditable}
            onChange={() => onToggleWholeDay(date)}
          />
          Whole day ({formatShiftDate({ date })})
        </label>
      </div>
    </div>
  );
}

export function AvailabilityCheckDetail({
  check,
  markDraft,
  onToggleShift,
  onToggleWholeDay,
  onSaveMarks,
  onConfirm,
  isSavingMarks,
  isConfirming,
  overlapWarningVisible,
}: AvailabilityCheckDetailProps) {
  const isEditable = check.state !== 'confirmed';

  return (
    <Card data-testid="availability-check-detail">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{check.ministryName}</CardTitle>
            <CardDescription>{check.planningCycleName}</CardDescription>
          </div>
          <Badge variant={check.state === 'confirmed' ? 'default' : 'outline'}>
            {check.state === 'confirmed' ? 'Confirmed' : 'Pending'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {check.shifts.map((shift) => (
            <ShiftAvailabilityRow
              key={shift.shiftId}
              shift={shift}
              isMarkedUnavailable={markDraft.markedShiftIds.has(shift.shiftId)}
              isWholeDayMarked={markDraft.wholeDayDates.has(
                getShiftDate(shift),
              )}
              isEditable={isEditable}
              onToggleShift={onToggleShift}
              onToggleWholeDay={onToggleWholeDay}
            />
          ))}
        </div>

        {overlapWarningVisible ? (
          <div
            data-testid="overlap-warning"
            className="border border-destructive p-3 text-destructive text-sm"
          >
            This check overlaps a shift you are already marked available for in
            another ministry. Adjust your marks before confirming, or ask your
            leader to resolve the conflict.
          </div>
        ) : null}

        {isEditable ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              data-testid="save-marks-button"
              disabled={isSavingMarks}
              onClick={onSaveMarks}
            >
              {isSavingMarks ? 'Saving…' : 'Save marks'}
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="confirm-availability-button"
              disabled={isConfirming}
              onClick={onConfirm}
            >
              {isConfirming ? 'Confirming…' : 'Confirm availability'}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Confirmed
            {check.confirmedAt
              ? ` on ${formatShiftDate({ date: check.confirmedAt.slice(0, 10) })}`
              : ''}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
