import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
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
import { INVITATIONS_QUERY_KEY } from '@/features/invitations/invitation-queries';
import { MINISTRIES_QUERY_KEY } from '@/features/ministries/ministry-queries';
import {
  type UpcomingAssignment,
  UpcomingAssignmentsAlert,
} from '@/features/people/components/upcoming-assignments-alert';
import {
  peopleDetailQueryKey,
  peopleQueryKey,
} from '@/features/people/people-queries';
import type { GetPerson200MinistriesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { peopleApi } from '@/utils/api-instances';

interface RefusalBody {
  error?: string;
  assignments?: UpcomingAssignment[];
}

/** Refusals meaning the shown card was stale; the dialog closes and the member refreshes. */
const STALE: Record<string, () => string> = {
  MINISTRY_MEMBERSHIP_INACTIVE: () => m.error_ministry_membership_inactive(),
  FORBIDDEN: () => m.error_forbidden(),
  NOT_FOUND: () => m.people_detail_not_found(),
};

const CALLER_CAPABILITIES_KEY = ['caller-capabilities'] as const;

/** Reads that list the member as serving or answering: capabilities, availability and scheduling. */
const MEMBERSHIP_READERS = [
  CALLER_CAPABILITIES_KEY,
  ['availability-checks'],
  ['availability-status'],
  ['my-availability'],
  ['cycle-builder'],
  ['assign-cycle'],
  ['ministry-schedule'],
  ['volunteer-dashboard'],
] as const;

type Failure =
  | { kind: 'blocked'; assignments: UpcomingAssignment[] }
  | { kind: 'message'; message: string };

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const names = { name: personName, ministry: card.ministryName };

  const refresh = () =>
    Promise.all(
      [peopleQueryKey({ churchId }), ...MEMBERSHIP_READERS].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  // Leaving a led Ministry shrinks the caller's reach: drop privileged caches before anything renders on them.
  const afterSelfRemoval = async () => {
    await queryClient.resetQueries({ queryKey: CALLER_CAPABILITIES_KEY });
    await Promise.all([
      queryClient.resetQueries({ queryKey: MINISTRIES_QUERY_KEY }),
      queryClient.resetQueries({ queryKey: INVITATIONS_QUERY_KEY }),
      queryClient.resetQueries({ queryKey: peopleQueryKey({ churchId }) }),
      refresh(),
    ]);
    const detail = queryClient.getQueryState(
      peopleDetailQueryKey({ churchId, memberId }),
    );
    if (detail?.status !== 'success') await navigate({ to: '/' });
  };

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
      await (isSelf ? afterSelfRemoval() : refresh());
    } catch (error) {
      const body = isAxiosError<RefusalBody>(error)
        ? error.response?.data
        : undefined;
      const code = body?.error ?? '';
      if (code === 'UPCOMING_ASSIGNMENTS' && body?.assignments) {
        setFailure({ kind: 'blocked', assignments: body.assignments });
      } else if (STALE[code]) {
        toast.error(STALE[code]());
        setOpen(false);
        await refresh();
      } else {
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
