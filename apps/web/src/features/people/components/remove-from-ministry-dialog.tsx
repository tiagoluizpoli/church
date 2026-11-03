import { m } from '@church/i18n/messages';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { UpcomingAssignmentsAlert } from '@/features/people/components/upcoming-assignments-alert';
import {
  type MembershipFailure,
  readMembershipRefusal,
  useMembershipChange,
} from '@/features/people/use-membership-change';
import type { GetPerson200MinistriesItem } from '@/infrastructure/api/churchAPI.schemas';
import { peopleApi } from '@/utils/api-instances';

interface RemoveFromMinistryDialogProps {
  memberId: string;
  personName: string;
  card: GetPerson200MinistriesItem;
  /** The caller removing their own membership, which can shrink what they may see. */
  isSelf: boolean;
}

/** Remove from a Ministry behind a confirmation; the server decides who may and what blocks it. */
export function RemoveFromMinistryDialog({
  memberId,
  personName,
  card,
  isSelf,
}: RemoveFromMinistryDialogProps) {
  const { refresh, afterSelfReduction, closeIfStale } = useMembershipChange({
    memberId,
  });
  const [open, setOpen] = useState(false);
  const closeDialog = () => setOpen(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<MembershipFailure | null>(null);
  const names = { name: personName, ministry: card.ministryName };

  const start = () => {
    setFailure(null);
    setOpen(true);
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      await peopleApi.endMinistryMembership(memberId, card.membershipId);
      setOpen(false);
      toast.success(m.people_removed_from_ministry_toast(names));
      await (isSelf ? afterSelfReduction() : refresh());
    } catch (error) {
      const { code, assignments } = readMembershipRefusal(error);
      if (code === 'UPCOMING_ASSIGNMENTS' && assignments) {
        setFailure({ kind: 'blocked', assignments });
      } else if (!(await closeIfStale({ code, close: closeDialog }))) {
        setFailure({
          kind: 'message',
          message: m.people_remove_from_ministry_failed(),
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
        aria-label={m.people_remove_from_ministry_label(names)}
        onClick={start}
      >
        {m.people_remove_from_ministry({ ministry: card.ministryName })}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.people_remove_from_ministry_title(names)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.people_remove_from_ministry_description(names)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure?.kind === 'blocked' ? (
            <UpcomingAssignmentsAlert
              title={m.people_remove_blocked_title({ name: personName })}
              assignments={failure.assignments}
            />
          ) : null}
          {failure?.kind === 'message' ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {m.people_access_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={confirm}
            >
              {pending
                ? m.people_remove_from_ministry_pending()
                : m.people_remove_from_ministry_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
