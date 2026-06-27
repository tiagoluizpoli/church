import { Button } from '@church/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { useEffect, useState } from 'react';

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

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
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
      setStart(toLocalInput(initial?.startTime));
      setEnd(toLocalInput(initial?.endTime));
      setLabel(initial?.label ?? '');
    }
  }, [open, initial]);

  const isDayBased = eventType === 'day_based';
  const canSave = isDayBased ? true : Boolean(start && end);

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
              <div className="space-y-1">
                <Label htmlFor="slot-start">Start time</Label>
                <Input
                  id="slot-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="slot-end">End time</Label>
                <Input
                  id="slot-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
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
                startTime: start
                  ? fromLocalInput(start)
                  : (initial?.startTime ?? ''),
                endTime: end ? fromLocalInput(end) : (initial?.endTime ?? ''),
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
