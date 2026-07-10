import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

interface ToDayBoundsInput {
  date: string;
}

/** A day's full span, per the event's own calendar day (FR: hourly events
 * carry all their slots within one day; day-based events span the full
 * start-to-end date range). Start is that day's midnight; end is the last
 * millisecond of the final day. */
function toDayStartIso({ date }: ToDayBoundsInput): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toDayEndIso({ date }: ToDayBoundsInput): string {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('hourly');

  const create = useMutation({
    mutationFn: (body: CreateEventFormValues) =>
      target.kind === 'ministry'
        ? adminApi.createEvent({ ...body, ministryId: target.ministryId })
        : adminApi.createPlanningEvent(target.cycleId, body),
  });

  const effectiveEndDate = eventType === 'hourly' ? startDate : endDate;
  const canSubmit = Boolean(
    title.trim() &&
      startDate &&
      effectiveEndDate &&
      startDate <= effectiveEndDate,
  );

  const resetForm = () => {
    setTitle('');
    setStartDate('');
    setEndDate('');
    setEventType('hourly');
  };

  const handleSubmit = async () => {
    if (!startDate || !effectiveEndDate) return;
    try {
      const result = await create.mutateAsync({
        title,
        startDate: toDayStartIso({ date: startDate }),
        endDate: toDayEndIso({ date: effectiveEndDate }),
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
            <Input
              id="event-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="event-start-date">Start date</Label>
              <Input
                id="event-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-end-date">End date</Label>
              <Input
                id="event-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </ResponsiveFormSurface>
  );
}
