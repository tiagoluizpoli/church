import { m } from '@church/i18n/messages';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { SetMinistryRoles409 } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export type UpcomingAssignment = Extract<
  SetMinistryRoles409,
  { assignments: unknown }
>['assignments'][number];

interface UpcomingAssignmentsAlertProps {
  title: string;
  assignments: UpcomingAssignment[];
}

/** Every Assignment blocking a Ministry Membership change, each linked to the Assign board in a new tab. */
export function UpcomingAssignmentsAlert({
  title,
  assignments,
}: UpcomingAssignmentsAlertProps) {
  const { churchTimezone } = useTimezone();
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{m.error_upcoming_assignments()}</p>
        <ul className="space-y-1">
          {assignments.map((blocker) => (
            <li key={blocker.assignmentId} className="break-words">
              {m.people_roles_blocker({
                event: blocker.eventTitle,
                time: formatInstantRangeOf({
                  start: blocker.shiftStart,
                  end: blocker.shiftEnd,
                  timeZone: churchTimezone,
                }),
                sector: blocker.sectorName,
                role: blocker.roleName,
              })}{' '}
              <a
                href={`/schedules/${blocker.ministryId}/${blocker.cycleId}/assign`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4"
              >
                {m.people_roles_blocker_link()}{' '}
                <span className="sr-only">
                  {m.invitations_invite_new_tab()}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
