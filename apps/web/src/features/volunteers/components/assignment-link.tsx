import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { Badge } from '@/components/ui/badge';
import type { GetPublishedVolunteerSchedule200AssignmentsItem as ScheduleAssignment } from '@/infrastructure/api/churchAPI.schemas';
import { formatTimeOf } from '@/shared/utils/church-time';

interface AssignmentInput {
  assignment: ScheduleAssignment;
}

interface AssignmentInZoneInput extends AssignmentInput {
  timeZone: string;
}

export interface AssignmentRoleLineInput extends AssignmentInput {
  /** True when the Volunteer serves in more than one Ministry. */
  showMinistry: boolean;
}

/** `10:30–12:00` in the Church Timezone. */
export function assignmentTimeRange({
  assignment,
  timeZone,
}: AssignmentInZoneInput): string {
  return `${formatTimeOf({ value: assignment.startTime, timeZone })}–${formatTimeOf({ value: assignment.endTime, timeZone })}`;
}

/** `Role · Sector`, plus the Ministry only when it tells the Volunteer something new. */
export function assignmentRoleLine({
  assignment: a,
  showMinistry,
}: AssignmentRoleLineInput): string {
  const ministry =
    showMinistry && a.ministryName !== a.sectorName ? [a.ministryName] : [];
  return [a.roleName, a.sectorName, ...ministry].join(' · ');
}

/** Amber marks a state that needs the Volunteer: an open Swap request. */
const attentionBadge =
  'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';

/** In-progress and open Swap request tags. */
export function AssignmentBadges({ assignment: a }: AssignmentInput) {
  const current = now();
  const inProgress =
    compareInstants({
      left: parseInstant({ value: a.startTime }),
      right: current,
    }) <= 0 &&
    compareInstants({
      left: current,
      right: parseInstant({ value: a.endTime }),
    }) < 0;
  return (
    <>
      {inProgress ? <Badge>{m.my_schedule_in_progress()}</Badge> : null}
      {a.swapRequested ? (
        <Badge variant="outline" className={attentionBadge}>
          {m.my_schedule_swap_requested()}
        </Badge>
      ) : null}
    </>
  );
}
