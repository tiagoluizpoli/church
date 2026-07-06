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
import { RadioGroup, RadioGroupItem } from '@church/ui/components/radio-group';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/utils/api-instances';

export type QuickCreateEventModalTarget =
  | { kind: 'ministry'; ministryId: string }
  | { kind: 'planning-cycle'; cycleId: string };

interface QuickCreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: QuickCreateEventModalTarget;
  onCreated: () => void;
}

type EventType = 'hourly' | 'day_based';

interface CreateEventFormValues {
  title: string;
  startDate: string;
  endDate: string;
  eventType: EventType;
}

interface DateTimeParts {
  date: string;
  hour: string;
  minute: string;
}

interface DateTimeFieldProps {
  label: string;
  value: DateTimeParts;
  onChange: (value: DateTimeParts) => void;
}

function createEmptyDateTimeParts(): DateTimeParts {
  return { date: '', hour: '', minute: '' };
}

function sanitizeTimeSegment({ rawValue }: { rawValue: string }): string {
  return rawValue.replaceAll(/\D/g, '').slice(0, 2);
}

function normalizeTimeSegment({
  rawValue,
  max,
}: {
  rawValue: string;
  max: number;
}): string {
  const sanitized = sanitizeTimeSegment({ rawValue });
  if (sanitized === '') return '';
  const num = Number.parseInt(sanitized, 10);
  if (Number.isNaN(num)) return '';
  return String(Math.min(num, max)).padStart(2, '0');
}

function toLocalDateTimeString({
  value,
}: {
  value: DateTimeParts;
}): string | null {
  if (!value.date || value.hour.length !== 2 || value.minute.length !== 2)
    return null;
  const hour = Number.parseInt(value.hour, 10);
  const minute = Number.parseInt(value.minute, 10);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  )
    return null;
  return `${value.date}T${value.hour}:${value.minute}:00`;
}

function DateTimeField({ label, value, onChange }: DateTimeFieldProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={`${label} date`}
            className="pl-8"
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 className="size-3.5 text-muted-foreground" />
          <Input
            aria-label={`${label} hour`}
            className="w-12 px-2 text-center tabular-nums"
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            value={value.hour}
            onChange={(e) =>
              onChange({
                ...value,
                hour: sanitizeTimeSegment({ rawValue: e.target.value }),
              })
            }
            onBlur={() =>
              onChange({
                ...value,
                hour: normalizeTimeSegment({ rawValue: value.hour, max: 23 }),
              })
            }
          />
          <span className="text-muted-foreground text-xs">:</span>
          <Input
            aria-label={`${label} minute`}
            className="w-12 px-2 text-center tabular-nums"
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            value={value.minute}
            onChange={(e) =>
              onChange({
                ...value,
                minute: sanitizeTimeSegment({ rawValue: e.target.value }),
              })
            }
            onBlur={() =>
              onChange({
                ...value,
                minute: normalizeTimeSegment({
                  rawValue: value.minute,
                  max: 59,
                }),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function QuickCreateEventModal({
  open,
  onOpenChange,
  target,
  onCreated,
}: QuickCreateEventModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [startDateTime, setStartDateTime] = useState<DateTimeParts>(
    createEmptyDateTimeParts(),
  );
  const [endDateTime, setEndDateTime] = useState<DateTimeParts>(
    createEmptyDateTimeParts(),
  );
  const [eventType, setEventType] = useState<EventType>('hourly');

  const create = useMutation({
    mutationFn: (body: CreateEventFormValues) =>
      target.kind === 'ministry'
        ? adminApi.createEvent({ ...body, ministryId: target.ministryId })
        : adminApi.createPlanningEvent(target.cycleId, body),
  });

  const startDate = toLocalDateTimeString({ value: startDateTime });
  const endDate = toLocalDateTimeString({ value: endDateTime });
  const canSubmit = Boolean(
    title.trim() &&
      startDate &&
      endDate &&
      new Date(startDate).getTime() < new Date(endDate).getTime(),
  );

  const resetForm = () => {
    setTitle('');
    setStartDateTime(createEmptyDateTimeParts());
    setEndDateTime(createEmptyDateTimeParts());
    setEventType('hourly');
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    try {
      const result = await create.mutateAsync({
        title,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        eventType,
      });
      onCreated();
      onOpenChange(false);
      resetForm();
      if (target.kind === 'ministry') {
        navigate({
          to: '/scheduling/events/$eventId/builder',
          params: { eventId: result.id },
        });
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ['planning-cycle-details', target.cycleId],
      });
      toast.success('Event added to cycle');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunday Morning Service"
            />
          </div>
          <DateTimeField
            label="Start"
            value={startDateTime}
            onChange={setStartDateTime}
          />
          <DateTimeField
            label="End"
            value={endDateTime}
            onChange={setEndDateTime}
          />
          <div className="space-y-1">
            <Label>Event type</Label>
            <RadioGroup
              value={eventType}
              onValueChange={(v) => setEventType(v as EventType)}
            >
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="hourly" /> Hourly (time slots)
              </Label>
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="day_based" /> Day-based
              </Label>
            </RadioGroup>
          </div>
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
            disabled={!canSubmit || create.isPending}
            onClick={handleSubmit}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
