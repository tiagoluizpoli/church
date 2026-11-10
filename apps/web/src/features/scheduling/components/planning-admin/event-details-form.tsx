import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { toEventSaveRefusal } from './event-editor.utils';
import { CancelToCycle } from './event-editor-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GetCycle200EventsItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export interface EventDetailsFormProps {
  cycleId: string;
  graph: GetCycle200EventsItem;
}

/** Sent-state title/location correction; no graph change, no Notification. */
export function EventDetailsForm({ cycleId, graph }: EventDetailsFormProps) {
  const {
    event: { id: eventId, title: savedTitle, location: savedLocation },
  } = graph;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(savedTitle);
  const [location, setLocation] = useState(savedLocation ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const details = { title: title.trim(), location: location.trim() };
      return adminApi.updatePlanningEventDetails(cycleId, eventId, details);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
      const updated = m.event_details_updated_toast();
      toast.success(updated);
      await navigate({
        to: '/cycles/$cycleId',
        params: { cycleId },
        search: { eventId },
      });
    },
    onError: async (failure) => {
      const refusal = toEventSaveRefusal({ error: failure });
      setError(refusal.message);
      if (refusal.stateConflict) {
        await queryClient.invalidateQueries({
          queryKey: ['cycle-details', cycleId],
        });
      }
    },
  });

  const canSave = title.trim() !== '' && !mutation.isPending;

  return (
    <form
      className="space-y-4"
      data-testid="event-details-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) mutation.mutate();
      }}
    >
      <p className="text-muted-foreground text-sm">
        {m.event_details_description()}
      </p>
      <div className="space-y-1">
        <Label htmlFor="event-title">{m.event_editor_title_label()}</Label>
        <Input
          id="event-title"
          value={title}
          onChange={(event) => {
            setError(null);
            setTitle(event.target.value);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-location">
          {m.event_editor_location_label()}
        </Label>
        <Input
          id="event-location"
          value={location}
          onChange={(event) => {
            setError(null);
            setLocation(event.target.value);
          }}
        />
      </div>
      {error ? (
        <p
          className="text-destructive text-sm"
          role="alert"
          data-testid="event-form-error"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave}>
          {mutation.isPending
            ? m.event_editor_saving()
            : m.event_details_submit()}
        </Button>
        <CancelToCycle cycleId={cycleId} />
      </div>
    </form>
  );
}
