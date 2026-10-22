import { TriangleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export interface AvailabilityFormProps {
  event: AvailabilityEventViewModel;
  eventTimeBlocks: AvailabilityEventTimeBlockViewModel[];
  isEditable: boolean;
  isOnline: boolean;
  onSave: (input: AvailabilitySaveInput) => void;
  saveState: AvailabilitySaveState;
}

export interface AvailabilityEventViewModel {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface AvailabilityEventTimeBlockViewModel {
  eventTimeBlockId: string;
  label: string;
  startTime: string;
  endTime: string;
  response?: 'available' | 'unavailable';
}

export interface AvailabilitySaveInput {
  answers: AvailabilityEventTimeBlockAnswerInput[];
  confirmOverlap?: boolean;
}

export interface AvailabilityEventTimeBlockAnswerInput {
  eventTimeBlockId: string;
  response: 'available' | 'unavailable';
}

export const AVAILABILITY_SAVE_STATES = [
  'idle',
  'saving',
  'saved',
  'error',
] as const;
export type AvailabilitySaveState = (typeof AVAILABILITY_SAVE_STATES)[number];

type EventTimeBlockResponseMap = Record<
  string,
  'available' | 'unavailable' | undefined
>;

function buildInitialResponses(
  eventTimeBlocks: AvailabilityEventTimeBlockViewModel[],
): EventTimeBlockResponseMap {
  return Object.fromEntries(
    eventTimeBlocks.map((eventTimeBlock) => [
      eventTimeBlock.eventTimeBlockId,
      eventTimeBlock.response,
    ]),
  ) as EventTimeBlockResponseMap;
}

interface HasAnsweredEveryEventTimeBlockInput {
  eventTimeBlocks: AvailabilityEventTimeBlockViewModel[];
  responses: EventTimeBlockResponseMap;
}

function hasAnsweredEveryEventTimeBlock({
  eventTimeBlocks,
  responses,
}: HasAnsweredEveryEventTimeBlockInput): boolean {
  return eventTimeBlocks.every(
    (eventTimeBlock) => responses[eventTimeBlock.eventTimeBlockId] != null,
  );
}

export function AvailabilityForm({
  event,
  eventTimeBlocks,
  isEditable,
  isOnline,
  onSave,
  saveState,
}: AvailabilityFormProps) {
  const { churchTimezone } = useTimezone();
  const [responses, setResponses] = useState<EventTimeBlockResponseMap>(() =>
    buildInitialResponses(eventTimeBlocks),
  );

  useEffect(() => {
    setResponses(buildInitialResponses(eventTimeBlocks));
  }, [eventTimeBlocks]);

  const canSave =
    isEditable &&
    isOnline &&
    eventTimeBlocks.length > 0 &&
    hasAnsweredEveryEventTimeBlock({ eventTimeBlocks, responses }) &&
    saveState !== 'saving';

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    onSave({
      answers: eventTimeBlocks.flatMap((eventTimeBlock) => {
        const response = responses[eventTimeBlock.eventTimeBlockId];
        if (!response) {
          return [];
        }

        return [
          {
            eventTimeBlockId: eventTimeBlock.eventTimeBlockId,
            response,
          },
        ];
      }),
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{event.title}</CardTitle>
        <CardDescription>
          Confirm whether you can serve in each leader-defined time block.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOnline ? (
          <Alert variant="destructive">
            <WifiOff className="size-4" />
            <AlertTitle>Offline</AlertTitle>
            <AlertDescription>
              Availability changes stay blocked until your connection returns.
            </AlertDescription>
          </Alert>
        ) : null}

        {eventTimeBlocks.length === 0 ? (
          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>No time blocks available yet</AlertTitle>
            <AlertDescription>
              Your leader still needs to publish service blocks for this event.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {eventTimeBlocks.map((eventTimeBlock) => {
              const response = responses[eventTimeBlock.eventTimeBlockId];

              return (
                <div
                  key={eventTimeBlock.eventTimeBlockId}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="font-medium text-base">
                        {eventTimeBlock.label}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {formatInstantRangeOf({
                          start: eventTimeBlock.startTime,
                          end: eventTimeBlock.endTime,
                          timeZone: churchTimezone,
                        })}
                      </p>
                    </div>
                    <Badge variant={response ? 'secondary' : 'outline'}>
                      {response === 'available'
                        ? 'Available'
                        : response === 'unavailable'
                          ? 'Unavailable'
                          : 'Answer required'}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={response === 'available' ? 'default' : 'outline'}
                      className={cn(
                        response === 'available' &&
                          'bg-emerald-600 hover:bg-emerald-700',
                      )}
                      disabled={!isEditable || !isOnline}
                      onClick={() =>
                        setResponses((current) => ({
                          ...current,
                          [eventTimeBlock.eventTimeBlockId]: 'available',
                        }))
                      }
                    >
                      I can serve
                    </Button>
                    <Button
                      type="button"
                      variant={
                        response === 'unavailable' ? 'destructive' : 'outline'
                      }
                      disabled={!isEditable || !isOnline}
                      onClick={() =>
                        setResponses((current) => ({
                          ...current,
                          [eventTimeBlock.eventTimeBlockId]: 'unavailable',
                        }))
                      }
                    >
                      I cannot serve
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button type="button" onClick={handleSave} disabled={!canSave}>
          Save availability
        </Button>
      </CardContent>
    </Card>
  );
}
