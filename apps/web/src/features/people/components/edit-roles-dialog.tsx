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

/** Refusals that keep the dialog open with the edits, explained in place. */
const KEPT_OPEN: Record<string, () => string> = {
  MINISTRY_ROLE_REQUIRED: () => m.error_ministry_role_required(),
  INVALID_MINISTRY_ROLE: () => m.error_invalid_ministry_role(),
};

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
  const { refresh, closeIfStale } = useMembershipChange({ memberId });
  const [open, setOpen] = useState(false);
  const closeDialog = () => setOpen(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<MembershipFailure | null>(null);
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
      const roleIds = [...new Set(selected)];
      await peopleApi.setMinistryRoles(memberId, card.membershipId, {
        roleIds,
      });
      setOpen(false);
      toast.success(m.people_roles_saved_toast({ name: personName }));
      await refresh();
    } catch (error) {
      const { code, assignments } = readMembershipRefusal(error);
      if (code === 'UPCOMING_ASSIGNMENTS' && assignments) {
        setFailure({ kind: 'blocked', assignments });
      } else if (KEPT_OPEN[code]) {
        setFailure({ kind: 'message', message: KEPT_OPEN[code]() });
      } else if (!(await closeIfStale({ code, close: closeDialog }))) {
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
                {pending ? m.people_access_saving() : m.people_roles_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
