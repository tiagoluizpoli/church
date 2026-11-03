import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
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
import { INVITATIONS_QUERY_KEY } from '@/features/invitations/invitation-queries';
import { invalidateMinistryReads } from '@/features/ministries/ministry-queries';
import type {
  ArchiveMinistry409,
  ArchiveMinistry409BlockersItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

interface MinistryArchiveProps {
  ministryId: string;
  name: string;
}

type CycleBlocker = Extract<ArchiveMinistry409BlockersItem, { kind: 'cycle' }>;

interface ArchiveRefusal {
  blockers: CycleBlocker[];
}

const isCycleBlocker = (
  blocker: ArchiveMinistry409BlockersItem,
): blocker is CycleBlocker => blocker.kind === 'cycle';

/** Archive + confirmation; a 409 lists the blocking Cycles to resolve first. */
export function MinistryArchive({ ministryId, name }: MinistryArchiveProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<ArchiveRefusal | 'failed' | null>(
    null,
  );

  const archive = async () => {
    setPending(true);
    try {
      await adminApi.archiveMinistry(ministryId);
      await navigate({ to: '/ministries' });
      await invalidateMinistryReads({ queryClient });
      // The archive revoked the Ministry's pending offers server-side.
      await queryClient.invalidateQueries({
        queryKey: [...INVITATIONS_QUERY_KEY, churchId],
      });
      toast.success(m.ministry_archived_toast());
    } catch (error) {
      const body = isAxiosError<ArchiveMinistry409>(error)
        ? error.response?.data
        : undefined;
      setRefusal(
        body?.error === 'MINISTRY_IN_USE'
          ? { blockers: (body.blockers ?? []).filter(isCycleBlocker) }
          : 'failed',
      );
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="surface-panel max-w-xl space-y-3 p-4">
      <h2 className="font-semibold text-lg">{m.ministry_archive_title()}</h2>
      <p className="text-muted-foreground text-sm">
        {m.ministry_archive_hint()}
      </p>
      {refusal === 'failed' ? (
        <p role="alert" className="text-destructive text-sm">
          {m.ministry_archive_failed()}
        </p>
      ) : null}
      {refusal && refusal !== 'failed' ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{m.error_ministry_in_use()}</p>
          <ul
            aria-label={m.ministry_archive_blockers_label()}
            className="list-disc space-y-1 ps-5"
          >
            {refusal.blockers.map((blocker) => (
              <li key={blocker.cycleId}>
                <Link
                  to="/schedules/$ministryId/$cycleId"
                  params={{
                    ministryId: blocker.ministryId,
                    cycleId: blocker.cycleId,
                  }}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-3"
                >
                  {blocker.cycleName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {m.ministry_archive_open()}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.ministry_archive_dialog_title({ name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.ministry_archive_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {m.ministries_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={archive}
            >
              {pending
                ? m.ministry_archive_archiving()
                : m.ministry_archive_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
