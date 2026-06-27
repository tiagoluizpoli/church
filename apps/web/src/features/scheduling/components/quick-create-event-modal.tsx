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
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/utils/trpc';

interface QuickCreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string;
  onCreated: () => void;
}

type EventType = 'hourly' | 'day_based';

export function QuickCreateEventModal({
  open,
  onOpenChange,
  ministryId,
  onCreated,
}: QuickCreateEventModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('hourly');

  const create = useMutation(trpc.adminLeader.createEvent.mutationOptions());

  const canSubmit = Boolean(title && startDate && endDate);

  const handleSubmit = async () => {
    try {
      const event = await create.mutateAsync({
        ministryId,
        title,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        eventType,
      });
      onCreated();
      onOpenChange(false);
      navigate({
        to: '/scheduling/events/$eventId/builder',
        params: { eventId: event.id },
      });
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
          <div className="space-y-1">
            <Label htmlFor="event-start">Start</Label>
            <Input
              id="event-start"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="event-end">End</Label>
            <Input
              id="event-end"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
