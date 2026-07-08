import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export interface AvailabilityNeededSectionProps {
  tasks: AvailabilityTaskViewModel[];
  onOpenEvent: (eventId: string) => void;
}

export interface AvailabilityTaskViewModel {
  eventId: string;
  eventTitle: string;
  ministryName: string;
  eventType: 'hourly' | 'day_based';
  eventStartLabel: string;
  eventEndLabel: string;
  completionState: 'missing' | 'partial' | 'complete';
}

function completionLabel({
  completionState,
}: {
  completionState: AvailabilityTaskViewModel['completionState'];
}): string {
  if (completionState === 'partial') {
    return 'Partial';
  }

  if (completionState === 'complete') {
    return 'Complete';
  }

  return 'Missing';
}

export function AvailabilityNeededSection({
  tasks,
  onOpenEvent,
}: AvailabilityNeededSectionProps) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Availability needed</CardTitle>
        <CardDescription>
          Finish event-specific availability before the event begins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((task) => (
          <div key={task.eventId} className="border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">{task.eventTitle}</div>
                <div className="text-muted-foreground">{task.ministryName}</div>
                <div className="text-muted-foreground">
                  {task.eventStartLabel} - {task.eventEndLabel}
                </div>
              </div>
              <Badge variant="outline">
                {completionLabel({ completionState: task.completionState })}
              </Badge>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenEvent(task.eventId)}
              >
                Open availability editor
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
