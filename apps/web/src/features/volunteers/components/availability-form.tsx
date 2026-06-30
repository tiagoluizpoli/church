import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@church/ui/components/alert';
import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Label } from '@church/ui/components/label';
import { cn } from '@church/ui/lib/utils';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface AvailabilityFormProps {
  event: AvailabilityEventViewModel;
  slots: AvailabilitySlotViewModel[];
  isEditable: boolean;
  isOnline: boolean;
  onSave: (input: AvailabilitySaveInput) => void;
  saveState: AvailabilitySaveState;
}

export interface AvailabilityEventViewModel {
  id: string;
  title: string;
  eventType: 'hourly' | 'day_based';
  startDate: string;
  endDate: string;
}

export interface AvailabilitySlotViewModel {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  response?: 'available' | 'unavailable';
}

export interface AvailabilitySaveInput {
  answers: AvailabilitySlotAnswerInput[];
  confirmOverlap?: boolean;
}

export interface AvailabilitySlotAnswerInput {
  slotId: string;
  response: 'available' | 'unavailable';
}

export const AVAILABILITY_SAVE_STATES = [
  'idle',
  'saving',
  'saved',
  'error',
] as const;
export type AvailabilitySaveState = (typeof AVAILABILITY_SAVE_STATES)[number];

type SlotResponseMap = Record<string, 'available' | 'unavailable' | undefined>;

function buildInitialResponses(
  slots: AvailabilitySlotViewModel[],
): SlotResponseMap {
  return Object.fromEntries(
    slots.map((slot) => [slot.slotId, slot.response]),
  ) as SlotResponseMap;
}

function formatSlotRange(slot: AvailabilitySlotViewModel): string {
  return `${new Date(slot.startTime).toLocaleString()} - ${new Date(
    slot.endTime,
  ).toLocaleTimeString()}`;
}

function hasAnsweredEverySlot(
  slots: AvailabilitySlotViewModel[],
  responses: SlotResponseMap,
): boolean {
  return slots.every((slot) => responses[slot.slotId] != null);
}

export function AvailabilityForm({
  event,
  slots,
  isEditable,
  isOnline,
  onSave,
  saveState,
}: AvailabilityFormProps) {
  const [responses, setResponses] = useState<SlotResponseMap>(() =>
    buildInitialResponses(slots),
  );

  useEffect(() => {
    setResponses(buildInitialResponses(slots));
  }, [slots]);

  const canSave =
    isEditable &&
    isOnline &&
    slots.length > 0 &&
    hasAnsweredEverySlot(slots, responses) &&
    saveState !== 'saving';

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    onSave({
      answers: slots.flatMap((slot) => {
        const response = responses[slot.slotId];
        if (!response) {
          return [];
        }

        return [
          {
            slotId: slot.slotId,
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
          Confirm whether you can serve in each leader-defined service slot.
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

        {slots.length === 0 ? (
          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>No slots available yet</AlertTitle>
            <AlertDescription>
              Your leader still needs to publish service blocks for this event.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => {
              const response = responses[slot.slotId];

              return (
                <div key={slot.slotId} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="font-medium text-base">
                        {slot.label}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {formatSlotRange(slot)}
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
                          [slot.slotId]: 'available',
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
                          [slot.slotId]: 'unavailable',
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
