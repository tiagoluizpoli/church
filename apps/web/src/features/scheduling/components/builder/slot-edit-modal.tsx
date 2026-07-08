import { useEffect, useState } from 'react';
import { isValidTimeValue, TimeSegmentInput } from './time-segment-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SlotEditValues {
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  label?: string;
}

interface SlotEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  eventType: 'hourly' | 'day_based';
  initial?: SlotEditValues;
  isPending: boolean;
  errorMessage?: string;
  onSave: (values: SlotEditValues) => void;
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function toLocalTimeInput(iso?: string): string {
  return toLocalInput(iso).slice(11, 16);
}

function fromLocalTimeInput(baseIso: string | undefined, time: string): string {
  if (!baseIso || !isValidTimeValue(time)) return '';
  const localDate = toLocalInput(baseIso).slice(0, 10);
  return new Date(`${localDate}T${time}`).toISOString();
}

export function SlotEditModal({
  open,
  onOpenChange,
  mode,
  eventType,
  initial,
  isPending,
  errorMessage,
  onSave,
}: SlotEditModalProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) {
      setStart(toLocalTimeInput(initial?.startTime));
      setEnd(toLocalTimeInput(initial?.endTime));
      setLabel(initial?.label ?? '');
    }
  }, [open, initial]);

  const isDayBased = eventType === 'day_based';
  const canSave = isDayBased
    ? true
    : isValidTimeValue(start) && isValidTimeValue(end);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add slot' : 'Edit slot'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!isDayBased && (
            <>
              <TimeSegmentInput
                label="Start time"
                value={start}
                onChange={setStart}
              />
              <TimeSegmentInput
                label="End time"
                value={end}
                onChange={setEnd}
              />
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="slot-label">Label (optional)</Label>
            <Input
              id="slot-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={isDayBased ? 'Day name' : 'e.g. Morning service'}
            />
          </div>

          {errorMessage && (
            <p className="text-destructive text-xs" data-testid="slot-error">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave || isPending}
            onClick={() =>
              onSave({
                startTime: fromLocalTimeInput(initial?.startTime, start),
                endTime: fromLocalTimeInput(initial?.endTime, end),
                label: label || undefined,
              })
            }
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
