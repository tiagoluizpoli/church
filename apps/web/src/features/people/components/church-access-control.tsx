import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { resetAfterSelfDemotion } from '@/features/people/authority-refresh';
import { peopleQueryKey } from '@/features/people/people-queries';
import type {
  GetPerson200,
  GetPerson200ChurchAccess,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CALLER_CAPABILITIES_QUERY_KEY } from '@/shared/hooks/use-caller-capabilities';
import { peopleApi } from '@/utils/api-instances';

interface RefusalBody {
  error?: string;
}

/** Refusals that mean the shown access was stale; each refreshes the detail. */
const REFUSALS: Record<string, () => string> = {
  LAST_CHURCH_ADMIN: () => m.error_last_church_admin(),
  FORBIDDEN: () => m.error_forbidden(),
  NOT_FOUND: () => m.people_detail_not_found(),
};

interface ChurchAccessControlProps {
  person: GetPerson200;
  churchAccess: GetPerson200ChurchAccess;
}

/** Make admin / Remove admin behind a confirmation; the server enforces who may and the last-admin rule. */
export function ChurchAccessControl({
  person,
  churchAccess,
}: ChurchAccessControlProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { id: memberId, name } = person;
  const promoting = churchAccess.accessLevel === 'member';
  const selfDemotion = !promoting && churchAccess.isSelf;
  const actionLabel = promoting
    ? m.people_make_admin()
    : m.people_remove_admin();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: peopleQueryKey({ churchId }) }),
      queryClient.invalidateQueries({
        queryKey: CALLER_CAPABILITIES_QUERY_KEY,
      }),
    ]);

  const afterSelfDemotion = async () => {
    const { detailReadable } = await resetAfterSelfDemotion({
      queryClient,
      churchId,
      memberId,
    });
    if (!detailReadable) await navigate({ to: '/' });
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await peopleApi.changeChurchAccess(memberId, {
        accessLevel: promoting ? 'admin' : 'member',
      });
      setOpen(false);
      if (selfDemotion && result.changed) {
        toast.success(m.people_removed_own_admin_toast());
        await afterSelfDemotion();
        return;
      }
      toast.success(
        promoting
          ? m.people_made_admin_toast({ name })
          : m.people_removed_admin_toast({ name }),
      );
      await refresh();
    } catch (error) {
      const code = isAxiosError<RefusalBody>(error)
        ? error.response?.data?.error
        : undefined;
      const known = code ? REFUSALS[code] : undefined;
      toast.error(known ? known() : m.people_access_failed());
      setOpen(false);
      if (known) await refresh();
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
        onClick={() => setOpen(true)}
      >
        {actionLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {promoting
                ? m.people_make_admin_title({ name })
                : selfDemotion
                  ? m.people_remove_own_admin_title()
                  : m.people_remove_admin_title({ name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {promoting
                ? m.people_make_admin_description({ name })
                : selfDemotion
                  ? m.people_remove_own_admin_description()
                  : m.people_remove_admin_description({ name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {m.people_access_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={promoting ? 'default' : 'destructive'}
              disabled={pending}
              onClick={confirm}
            >
              {pending ? m.people_access_saving() : actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
