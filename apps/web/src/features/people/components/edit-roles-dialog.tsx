import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RolePicker } from '@/features/invitations/components/invite-dialog';
import { peopleQueryKey } from '@/features/people/people-queries';
import type {
  GetPerson200MinistriesItem,
  SetMinistryRoles409,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { peopleApi } from '@/utils/api-instances';

type UpcomingAssignment = Extract<
  SetMinistryRoles409,
  { assignments: unknown }
>['assignments'][number];

interface RefusalBody {
  error?: string;
  assignments?: UpcomingAssignment[];
}

/** Refusals that keep the dialog open with the edits, explained in place. */
const KEPT_OPEN: Record<string, () => string> = {
  MINISTRY_ROLE_REQUIRED: () => m.error_ministry_role_required(),
  INVALID_MINISTRY_ROLE: () => m.error_invalid_ministry_role(),
};

/** Refusals meaning the shown card was stale; the dialog closes and the member refreshes. */
const STALE: Record<string, () => string> = {
  FORBIDDEN: () => m.error_forbidden(),
  NOT_FOUND: () => m.people_detail_not_found(),
};

/** Scheduling reads whose candidate qualifications follow Role grants. */
const QUALIFICATION_READERS = [['cycle-builder']] as const;

type Failure =
  | { kind: 'blocked'; assignments: UpcomingAssignment[] }
  | { kind: 'message'; message: string };

interface EditRolesDialogProps {
  memberId: string;
  personName: string;
  card: GetPerson200MinistriesItem;
}

/** Edit Roles on one Ministry card: the complete set, saved at once; the server decides what is allowed. */
export function EditRolesDialog({
  memberId,
  personName,
  card,
}: EditRolesDialogProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [required, setRequired] = useState(false);
  const errorId = useId();
  const names = { name: personName, ministry: card.ministryName };
  const heldArchived = card.roles.filter((role) => role.archived);

  const start = () => {
    setSelected(card.roles.map((role) => role.id));
    setFailure(null);
    setRequired(false);
    setOpen(true);
  };

  const refresh = () =>
    Promise.all(
      [peopleQueryKey({ churchId }), ...QUALIFICATION_READERS].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (card.ministryAccessLevel === 'volunteer' && selected.length === 0) {
      setRequired(true);
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      await peopleApi.setMinistryRoles(memberId, card.membershipId, {
        roleIds: [...new Set(selected)],
      });
      setOpen(false);
      toast.success(m.people_roles_saved_toast({ name: personName }));
      await refresh();
    } catch (error) {
      const body = isAxiosError<RefusalBody>(error)
        ? error.response?.data
        : undefined;
      const code = body?.error ?? '';
      if (code === 'UPCOMING_ASSIGNMENTS' && body?.assignments) {
        setFailure({ kind: 'blocked', assignments: body.assignments });
      } else if (KEPT_OPEN[code]) {
        setFailure({ kind: 'message', message: KEPT_OPEN[code]() });
      } else if (STALE[code]) {
        toast.error(STALE[code]());
        setOpen(false);
        await refresh();
      } else {
        setFailure({ kind: 'message', message: m.people_roles_failed() });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={m.people_edit_roles_label(names)}
        onClick={start}
      >
        {m.people_edit_roles()}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent showCloseButton={false}>
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{m.people_edit_roles_title(names)}</DialogTitle>
              <DialogDescription>
                {m.people_edit_roles_description({ name: personName })}
              </DialogDescription>
            </DialogHeader>
            <RolePicker
              ministryId={card.ministryId}
              selected={selected}
              heldArchived={heldArchived}
              idPrefix={`edit-${card.membershipId}`}
              errorId={required ? errorId : undefined}
              onChange={(next) => {
                setRequired(false);
                setSelected(next);
              }}
            />
            {required ? (
              <p id={errorId} className="text-destructive text-sm">
                {m.error_ministry_role_required()}
              </p>
            ) : null}
            {failure?.kind === 'message' ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{failure.message}</AlertDescription>
              </Alert>
            ) : null}
            {failure?.kind === 'blocked' ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>{m.people_roles_blocked_title()}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{m.error_upcoming_assignments()}</p>
                  <ul className="space-y-1">
                    {failure.assignments.map((blocker) => (
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
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {m.people_access_cancel()}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? m.people_access_saving() : m.people_roles_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
