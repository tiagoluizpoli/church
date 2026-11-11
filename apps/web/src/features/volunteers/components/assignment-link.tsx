import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { Link } from '@tanstack/react-router';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import { Badge } from '@/components/ui/badge';
import type { GetPublishedVolunteerSchedule200AssignmentsItem as ScheduleAssignment } from '@/infrastructure/api/churchAPI.schemas';
import { formatTimeOf } from '@/shared/utils/church-time';

interface AssignmentLinkProps {
  assignment: ScheduleAssignment;
  timeZone: string;
}

/** One Assignment row linking to its detail, with in-progress and open Swap request tags. */
export function AssignmentLink({
  assignment: a,
  timeZone,
}: AssignmentLinkProps) {
  const start = parseInstant({ value: a.startTime });
  const end = parseInstant({ value: a.endTime });
  const current = now();
  const inProgress =
    compareInstants({ left: start, right: current }) <= 0 &&
    compareInstants({ left: current, right: end }) < 0;
  return (
    <Link
      to="/my-schedule/$assignmentId"
      params={{ assignmentId: a.assignmentId }}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
    >
      <span className="min-w-0 break-words">
        {assignmentDayLabel({ startTime: a.startTime, timeZone })} ·{' '}
        {formatTimeOf({ value: a.startTime, timeZone })}–
        {formatTimeOf({ value: a.endTime, timeZone })} · {a.ministryName} ·{' '}
        {a.roleName} · {a.sectorName}
      </span>
      {inProgress ? <Badge>{m.my_schedule_in_progress()}</Badge> : null}
      {a.swapRequested ? (
        <Badge variant="outline">{m.my_schedule_swap_requested()}</Badge>
      ) : null}
    </Link>
  );
}
