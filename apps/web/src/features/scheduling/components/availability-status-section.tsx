import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetAvailabilityStatus200StatusesItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export interface AvailabilityStatusSectionProps {
  cycleId: string;
  ministryId: string;
}

interface DescribeAcknowledgementInput {
  state: GetAvailabilityStatus200StatusesItem['state'];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function describeAcknowledgement({
  state,
}: DescribeAcknowledgementInput): string {
  return state === 'confirmed' ? 'Acknowledged' : 'Not looked';
}

export function AvailabilityStatusSection({
  cycleId,
  ministryId,
}: AvailabilityStatusSectionProps) {
  const statusQuery = useQuery({
    queryKey: ['availability-status', cycleId, ministryId],
    queryFn: () => adminApi.getCycleAvailabilityStatus(cycleId, { ministryId }),
    retry: false,
  });
  const statuses = statusQuery.data?.statuses ?? [];

  return (
    <Card data-testid="availability-status-list">
      <CardHeader>
        <CardTitle>Availability acknowledgement</CardTitle>
        <CardDescription>
          Track whether each volunteer has looked at their availability check
          for this cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {statusQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : statusQuery.isError ? (
          <div className="text-destructive text-sm">
            {getErrorMessage(statusQuery.error)}
          </div>
        ) : statuses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No volunteers to show yet.
          </p>
        ) : (
          statuses.map((status) => (
            <div
              key={status.volunteerId}
              data-testid="availability-status-row"
              className="flex items-center justify-between border p-2 text-sm"
            >
              <span>{status.volunteerName}</span>
              <span className="text-muted-foreground">
                {describeAcknowledgement({ state: status.state })}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
