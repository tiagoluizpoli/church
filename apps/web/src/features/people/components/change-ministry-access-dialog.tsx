import { m } from '@church/i18n/messages';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { UpcomingAssignmentsAlert } from '@/features/people/components/upcoming-assignments-alert';
import {
  type MembershipFailure,
  readMembershipRefusal,
  useMembershipChange,
} from '@/features/people/use-membership-change';
import type { GetPerson200MinistriesItem } from '@/infrastructure/api/churchAPI.schemas';
import { peopleApi } from '@/utils/api-instances';

interface ChangeMinistryAccessDialogProps {
  memberId: string;
  personName: string;
  card: GetPerson200MinistriesItem;
  /** The member is the caller, so a demotion shrinks the caller's own reach. */
  isSelf: boolean;
}

/** Make leader / Make volunteer on one Ministry card; a demotion with no active Role asks for Roles in the same dialog. */
export function ChangeMinistryAccessDialog({
  memberId,
  personName,
  card,
  isSelf,
}: ChangeMinistryAccessDialogProps) {
  const { refresh, afterSelfReduction, closeIfStale } = useMembershipChange({
    memberId,
  });
  const [open, setOpen] = useState(false);
  const closeDialog = () => setOpen(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<MembershipFailure | null>(null);
  const [required, setRequired] = useState(false);
  const [serverNeedsRole, setServerNeedsRole] = useState(false);
  const errorId = useId();
  const promoting = card.ministryAccessLevel === 'volunteer';
  const names = { name: personName, ministry: card.ministryName };
  const heldArchived = card.roles.filter((role) => role.archived);
  const archivedIds = new Set(heldArchived.map((role) => role.id));
  const needsRoles =
    !promoting &&
    (serverNeedsRole || card.roles.every((role) => role.archived));
  const selfDemotion = !promoting && isSelf;
  const label = promoting ? m.people_make_leader() : m.people_make_volunteer();

  const start = () => {
    setSelected(card.roles.map((role) => role.id));
    setFailure(null);
    setRequired(false);
    setServerNeedsRole(false);
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (needsRoles && selected.every((id) => archivedIds.has(id))) {
      setRequired(true);
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const roleIds = [...new Set(selected)];
      await peopleApi.changeMinistryAccess(memberId, card.membershipId, {
        accessLevel: promoting ? 'leader' : 'volunteer',
        ...(needsRoles ? { roleIds } : {}),
      });
      setOpen(false);
      if (selfDemotion) {
        toast.success(m.people_made_own_volunteer_toast(names));
        await afterSelfReduction();
        return;
      }
      toast.success(
        promoting
          ? m.people_made_leader_toast(names)
          : m.people_made_volunteer_toast(names),
      );
      await refresh();
    } catch (error) {
      const { code, assignments } = readMembershipRefusal(error);
      if (code === 'UPCOMING_ASSIGNMENTS' && assignments) {
        setFailure({ kind: 'blocked', assignments });
      } else if (code === 'MINISTRY_ROLE_REQUIRED') {
        // The card was stale: it held an active Role the server no longer sees.
        setServerNeedsRole(true);
        setRequired(true);
      } else if (code === 'INVALID_MINISTRY_ROLE') {
        setFailure({
          kind: 'message',
          message: m.error_invalid_ministry_role(),
        });
      } else if (!(await closeIfStale({ code, close: closeDialog }))) {
        setFailure({
          kind: 'message',
          message: m.people_ministry_access_failed(),
        });
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
        aria-label={
          promoting
            ? m.people_make_leader_label(names)
            : m.people_make_volunteer_label(names)
        }
        onClick={start}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent showCloseButton={false}>
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {promoting
                  ? m.people_make_leader_title(names)
                  : selfDemotion
                    ? m.people_make_volunteer_own_title(names)
                    : m.people_make_volunteer_title(names)}
              </DialogTitle>
              <DialogDescription>
                {promoting
                  ? m.people_make_leader_description(names)
                  : selfDemotion
                    ? m.people_make_volunteer_own_description(names)
                    : m.people_make_volunteer_description(names)}
              </DialogDescription>
            </DialogHeader>
            {needsRoles ? (
              <>
                <p className="text-sm">
                  {m.people_make_volunteer_roles_prompt(names)}
                </p>
                <RolePicker
                  ministryId={card.ministryId}
                  selected={selected}
                  heldArchived={heldArchived}
                  idPrefix={`level-${card.membershipId}`}
                  selectAllKeepsSelection
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
              </>
            ) : null}
            {failure?.kind === 'message' ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{failure.message}</AlertDescription>
              </Alert>
            ) : null}
            {failure?.kind === 'blocked' ? (
              <UpcomingAssignmentsAlert assignments={failure.assignments} />
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
                {pending ? m.people_access_saving() : label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
