import { skipToken, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import type { GetAssignmentDetail200 } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';

interface AssignmentBreadcrumb {
  segment: string;
  label: string | null;
}

/** Observe the page's authorized read; never fetch an assignment just to name a crumb. */
export function useAssignmentBreadcrumb(): AssignmentBreadcrumb | null {
  const { assignmentId } = useParams({ strict: false });
  const { churchTimezone } = useTimezone();
  const query = useQuery<GetAssignmentDetail200>({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: skipToken,
  });
  if (!assignmentId) return null;
  const detail = query.isError ? undefined : query.data;
  return {
    segment: assignmentId,
    label: detail
      ? `${assignmentDayLabel({ startTime: detail.startTime, timeZone: churchTimezone })} · ${detail.ministryName}`
      : null,
  };
}
