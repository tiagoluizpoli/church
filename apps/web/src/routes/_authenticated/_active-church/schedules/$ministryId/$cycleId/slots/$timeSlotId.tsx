import { createFileRoute } from '@tanstack/react-router';
import { PreparationBlockEditor } from '@/features/scheduling/components/prepare/preparation-block-editor';

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/slots/$timeSlotId',
)({ component: PreparationBlockRoute });

function PreparationBlockRoute() {
  const { ministryId, cycleId, timeSlotId } = Route.useParams();
  return (
    <PreparationBlockEditor
      ministryId={ministryId}
      cycleId={cycleId}
      eventTimeBlockId={timeSlotId}
    />
  );
}
