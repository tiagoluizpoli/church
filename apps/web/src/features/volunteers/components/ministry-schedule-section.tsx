import { useEffect, useState } from 'react';
import type {
  DashboardMinistryOption,
  DashboardMinistryScheduleEvent,
} from '../lib/dashboard-mappers';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface MinistryScheduleSectionProps {
  ministries: DashboardMinistryOption[];
  selectedMinistryId?: string;
  canSwitchMinistry: boolean;
  events: DashboardMinistryScheduleEvent[];
  isLoading: boolean;
  onSelectMinistry: (ministryId: string) => void;
}

function getConfirmationStateLabel(
  state: DashboardMinistryScheduleEvent['rows'][number]['confirmationState'],
): string {
  if (state === 'confirmed') {
    return 'Confirmed';
  }

  if (state === 'declined') {
    return 'Declined';
  }

  if (state === 'pending') {
    return 'Pending';
  }

  return 'Open';
}

export function MinistryScheduleSection({
  ministries,
  selectedMinistryId,
  canSwitchMinistry,
  events,
  isLoading,
  onSelectMinistry,
}: MinistryScheduleSectionProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | undefined>();

  useEffect(() => {
    if (
      expandedEventId &&
      events.some((event) => event.eventId === expandedEventId)
    ) {
      return;
    }

    setExpandedEventId(undefined);
  }, [events, expandedEventId]);

  return (
    <Card className="w-full">
      <CardHeader className="space-y-3">
        <div className="space-y-1">
          <CardTitle>Ministry Schedule</CardTitle>
          <CardDescription>
            Browse published schedule rows without leader-only conflict or audit
            details.
          </CardDescription>
        </div>

        {canSwitchMinistry ? (
          <div className="w-full max-w-xs">
            <Select
              value={selectedMinistryId}
              onValueChange={(ministryId) => {
                if (ministryId) {
                  onSelectMinistry(ministryId);
                }
              }}
            >
              <SelectTrigger aria-label="Select ministry">
                <SelectValue placeholder="Select a ministry" />
              </SelectTrigger>
              <SelectContent>
                {ministries.map((ministry) => (
                  <SelectItem key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Alert>
            <AlertTitle>Loading ministry schedule</AlertTitle>
            <AlertDescription>
              Pulling the latest published rows for this ministry.
            </AlertDescription>
          </Alert>
        ) : null}

        {!isLoading && events.length === 0 ? (
          <Alert>
            <AlertTitle>No published ministry schedule yet</AlertTitle>
            <AlertDescription>
              Published events for this ministry will appear here when leaders
              finalize them.
            </AlertDescription>
          </Alert>
        ) : null}

        {!isLoading
          ? events.map((event) => {
              const isExpanded = expandedEventId === event.eventId;

              return (
                <div key={event.eventId} className="border p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-muted-foreground">
                        {new Date(event.startDate).toLocaleString()} -{' '}
                        {new Date(event.endDate).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {event.assignmentCount} assignments
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setExpandedEventId((currentEventId) =>
                            currentEventId === event.eventId
                              ? undefined
                              : event.eventId,
                          )
                        }
                      >
                        {isExpanded
                          ? `Hide schedule for ${event.title}`
                          : `Show schedule for ${event.title}`}
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 space-y-3">
                      {event.rows.map((row, index) => (
                        <div
                          key={`${row.slotId}-${row.roleName}-${row.volunteerDisplayName ?? 'open'}-${index}`}
                          className="space-y-2 border px-3 py-2"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <div className="font-medium">{row.roleName}</div>
                              <div className="text-muted-foreground">
                                {row.slotLabel}
                              </div>
                              {row.teamName ? (
                                <div className="text-muted-foreground">
                                  Team: {row.teamName}
                                </div>
                              ) : null}
                              <div className="text-muted-foreground">
                                Volunteer: {row.volunteerDisplayName ?? 'Open'}
                              </div>
                            </div>

                            <Badge variant="outline">
                              {getConfirmationStateLabel(row.confirmationState)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          : null}
      </CardContent>
    </Card>
  );
}
