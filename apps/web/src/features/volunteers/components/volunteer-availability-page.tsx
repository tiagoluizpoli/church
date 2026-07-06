import { Skeleton } from '@church/ui/components/skeleton';
import { useVolunteerAvailability } from '../hooks/use-volunteer-availability';
import { AvailabilityCheckDetail } from './availability-check-detail';
import { AvailabilityCheckList } from './availability-check-list';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function VolunteerAvailabilityPage() {
  const availability = useVolunteerAvailability();

  return (
    <div className="space-y-6" data-testid="volunteer-availability-page">
      {availability.checksQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : availability.checksQuery.isError ? (
        <div className="rounded border border-destructive p-4 text-destructive text-sm">
          {getErrorMessage(availability.checksQuery.error)}
        </div>
      ) : (
        <AvailabilityCheckList
          checks={availability.checks}
          selectedCheckId={availability.selectedCheckId}
          onSelectCheck={availability.selectCheck}
        />
      )}

      {availability.selectedCheckId ? (
        availability.detailQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : availability.detailQuery.isError ? (
          <div className="rounded border border-destructive p-4 text-destructive text-sm">
            {getErrorMessage(availability.detailQuery.error)}
          </div>
        ) : availability.detail ? (
          <AvailabilityCheckDetail
            check={availability.detail}
            markDraft={availability.markDraft}
            onToggleShift={availability.toggleShift}
            onToggleWholeDay={availability.toggleWholeDay}
            onSaveMarks={() => availability.saveMarks.mutate()}
            onConfirm={() => availability.confirmCheck.mutate()}
            isSavingMarks={availability.saveMarks.isPending}
            isConfirming={availability.confirmCheck.isPending}
            overlapWarningVisible={availability.overlapWarningVisible}
          />
        ) : null
      ) : null}
    </div>
  );
}
