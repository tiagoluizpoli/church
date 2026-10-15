import {
  addMilliseconds,
  calendarDayBounds,
  parseCalendarDay,
} from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { adminApi } from '@/utils/api-instances';

interface QuickCreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  onCreated: () => void;
}

interface CreateEventFormValues {
  title: string;
  start: string;
  end: string;
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

/** The full span of the chosen calendar days, read in the Church Timezone,
 * not UTC (#149). Start is `start`'s church-local midnight; end is the last
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
  cycleId,
  onCreated,
}: QuickCreateEventModalProps) {
  const { churchTimezone } = useTimezone();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const create = useMutation({
    mutationFn: (body: CreateEventFormValues) =>
      adminApi.createPlanningEvent(cycleId, body),
  });

  // An empty end date means a single-day Event.
  const effectiveEnd = end || start;
  const canSubmit = Boolean(
    title.trim() && start && effectiveEnd && start <= effectiveEnd,
  );

  const resetForm = () => {
    setTitle('');
    setStart('');
    setEnd('');
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
      });
      onCreated();
      onOpenChange(false);
      resetForm();
      await queryClient.invalidateQueries({
        queryKey: ['cycle-details', cycleId],
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
            <Label htmlFor="event-end-date">End date (optional)</Label>
            <DatePickerField
              id="event-end-date"
              value={end}
              onChange={setEnd}
            />
          </div>
        </div>
      </div>
    </ResponsiveFormSurface>
  );
}
