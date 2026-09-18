import {
  addMilliseconds,
  calendarDayBounds,
  parseCalendarDay,
} from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTimezone } from '@/shared/hooks/use-timezone';
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
  start: string;
  end: string;
  eventType: EventType;
}

interface ToDayRangeBoundsInput {
  start: string;
  end: string;
  timeZone: string;
}

interface DayRangeBounds {
  start: string;
  end: string;
}

/** A day range's full span, per the event's own calendar days (FR: hourly
 * events carry all their slots within one day; day-based events span the
 * full start-to-end date range) — read in the Church Timezone, not UTC
 * (#149). Start is `start`'s church-local midnight; end is the last
 * millisecond before church-local midnight after `end`. */
function toDayRangeBounds({
  start,
  end,
  timeZone,
}: ToDayRangeBoundsInput): DayRangeBounds {
  return {
    start: calendarDayBounds({
      day: parseCalendarDay({ value: start }),
      timeZone,
    }).start,
    end: addMilliseconds({
      instant: calendarDayBounds({
        day: parseCalendarDay({ value: end }),
        timeZone,
      }).end,
      milliseconds: -1,
    }),
  };
}

export function QuickCreateEventModal({
  open,
  onOpenChange,
  target,
  onCreated,
}: QuickCreateEventModalProps) {
  const { churchTimezone } = useTimezone();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [eventType, setEventType] = useState<EventType>('hourly');

  const create = useMutation({
    mutationFn: (body: CreateEventFormValues) =>
      target.kind === 'ministry'
        ? adminApi.createEvent({ ...body, ministryId: target.ministryId })
        : adminApi.createPlanningEvent(target.cycleId, body),
  });

  const effectiveEnd = eventType === 'hourly' ? start : end;
  const canSubmit = Boolean(
    title.trim() && start && effectiveEnd && start <= effectiveEnd,
  );

  const resetForm = () => {
    setTitle('');
    setStart('');
    setEnd('');
    setEventType('hourly');
  };

  const handleSubmit = async () => {
    if (!start || !effectiveEnd) return;
    const bounds = toDayRangeBounds({
      start,
      end: effectiveEnd,
      timeZone: churchTimezone,
    });
    try {
      await create.mutateAsync({
        title,
        start: bounds.start,
        end: bounds.end,
        eventType,
      });
      onCreated();
      onOpenChange(false);
      resetForm();
      if (target.kind === 'ministry') {
        navigate({
          to: '/scheduling/tailoring',
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
    <ResponsiveFormSurface
      open={open}
      onOpenChange={onOpenChange}
      title="New Event"
      footer={
        <>
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
        </>
      }
    >
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
        {eventType === 'hourly' ? (
          <div className="space-y-1">
            <Label htmlFor="event-date">Date</Label>
            <DatePickerField
              id="event-date"
              value={start}
              onChange={setStart}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="event-start-date">Start date</Label>
              <DatePickerField
                id="event-start-date"
                value={start}
                onChange={setStart}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-end-date">End date</Label>
              <DatePickerField
                id="event-end-date"
                value={end}
                onChange={setEnd}
              />
            </div>
          </div>
        )}
      </div>
    </ResponsiveFormSurface>
  );
}
