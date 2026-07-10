import type { EditingEventState } from './planning-admin.types';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface EditEventDialogProps {
  editingEvent: EditingEventState | null;
  updateEventPending: boolean;
  onChange: (event: EditingEventState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

/** The "Edit day" dialog — title/description/location/start for an existing
 * day/event (FR-007), mirroring the field set the manual-event-creation flow
 * already collects (see spec.md's Assumptions). */
export function EditEventDialog({
  editingEvent,
  updateEventPending,
  onChange,
  onOpenChange,
  onSubmit,
}: EditEventDialogProps) {
  return (
    <ResponsiveFormSurface
      open={editingEvent !== null}
      onOpenChange={onOpenChange}
      title="Edit day"
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
            disabled={!editingEvent?.title.trim() || updateEventPending}
            onClick={onSubmit}
          >
            {updateEventPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      {editingEvent ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-event-title">Title</Label>
            <Input
              id="edit-event-title"
              value={editingEvent.title}
              onChange={(e) =>
                onChange({ ...editingEvent, title: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-event-description">Description</Label>
            <Textarea
              id="edit-event-description"
              value={editingEvent.description}
              onChange={(e) =>
                onChange({ ...editingEvent, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-event-location">Location</Label>
            <Input
              id="edit-event-location"
              value={editingEvent.location}
              onChange={(e) =>
                onChange({ ...editingEvent, location: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-event-start">Start</Label>
            <Input
              id="edit-event-start"
              type="datetime-local"
              value={editingEvent.startDateTimeLocal}
              onChange={(e) =>
                onChange({
                  ...editingEvent,
                  startDateTimeLocal: e.target.value,
                })
              }
            />
          </div>
        </div>
      ) : null}
    </ResponsiveFormSurface>
  );
}
