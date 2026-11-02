import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type ArchiveBlocker,
  ArchiveBlockerList,
  archiveBlockersOf,
} from '@/features/ministries/components/archive-blockers';
import { MinistryNameForm } from '@/features/ministries/components/ministry-name-form';
import {
  invalidateRoleReads,
  useMinistryRoles,
} from '@/features/ministries/role-queries';
import type { ListMinistryRoles200RolesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

type MinistryRole = ListMinistryRoles200RolesItem;

interface MinistryRolesProps {
  ministryId: string;
}

interface SaveInput {
  name: string;
}

/** Which name dialog is open: a new Role, or renaming an existing one. */
type NameDialog = { mode: 'add' } | { mode: 'rename'; role: MinistryRole };

/** The Ministry's active Role registry, for ChurchAdmins and its leaders. */
export function MinistryRoles({ ministryId }: MinistryRolesProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const roles = useMinistryRoles({ ministryId });
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [archiving, setArchiving] = useState<MinistryRole | null>(null);

  const refresh = () =>
    invalidateRoleReads({ queryClient, churchId, ministryId });

  const save = async ({ name }: SaveInput) => {
    if (nameDialog?.mode === 'rename') {
      await adminApi.renameMinistryRole(ministryId, nameDialog.role.id, {
        name,
      });
      toast.success(m.ministry_roles_renamed_toast());
    } else {
      await adminApi.createMinistryRole(ministryId, { name });
      toast.success(m.ministry_roles_added_toast());
    }
    await refresh();
    setNameDialog(null);
  };

  return (
    <section className="surface-panel max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-lg">{m.ministry_tab_roles()}</h2>
        <Button type="button" onClick={() => setNameDialog({ mode: 'add' })}>
          {m.ministry_roles_add()}
        </Button>
      </div>
      {roles.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-destructive text-sm">
            {m.ministry_roles_load_failed()}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => roles.refetch()}
          >
            {m.ministries_retry()}
          </Button>
        </div>
      ) : roles.data && roles.data.roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {m.ministry_roles_empty()}
        </p>
      ) : roles.data ? (
        <ul aria-label={m.ministry_roles_list_label()} className="divide-y">
          {roles.data.roles.map((role) => (
            <li
              key={role.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span data-testid="role-name">{role.name}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={m.ministry_roles_rename_named({
                    name: role.name,
                  })}
                  onClick={() => setNameDialog({ mode: 'rename', role })}
                >
                  {m.ministry_roles_rename()}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={m.ministry_roles_archive_named({
                    name: role.name,
                  })}
                  onClick={() => setArchiving(role)}
                >
                  {m.ministry_roles_archive()}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog
        open={nameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setNameDialog(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename'
                ? m.ministry_roles_rename_title()
                : m.ministry_roles_add_title()}
            </DialogTitle>
            {nameDialog?.mode === 'add' ? (
              <DialogDescription>
                {m.ministry_roles_add_description()}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {nameDialog ? (
            <MinistryNameForm
              initialName={
                nameDialog.mode === 'rename' ? nameDialog.role.name : ''
              }
              autoFocus
              onSave={save}
              renderActions={(pending) => (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setNameDialog(null)}
                  >
                    {m.ministries_cancel()}
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {nameDialog.mode === 'rename'
                      ? m.ministry_roles_rename_submit()
                      : m.ministry_roles_add_submit()}
                  </Button>
                </DialogFooter>
              )}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {archiving ? (
        <ArchiveRoleDialog
          ministryId={ministryId}
          role={archiving}
          onArchived={refresh}
          onClose={() => setArchiving(null)}
        />
      ) : null}
    </section>
  );
}

interface ArchiveRoleDialogProps {
  ministryId: string;
  role: MinistryRole;
  onArchived: () => Promise<void>;
  onClose: () => void;
}

/** Confirms the archive; a refusal stays open with its blocking locations. */
function ArchiveRoleDialog({
  ministryId,
  role,
  onArchived,
  onClose,
}: ArchiveRoleDialogProps) {
  const [pending, setPending] = useState(false);
  const [blockers, setBlockers] = useState<ArchiveBlocker[]>();
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setPending(true);
    setFailed(false);
    try {
      await adminApi.archiveMinistryRole(ministryId, role.id);
      toast.success(m.ministry_roles_archived_toast());
      await onArchived();
      onClose();
    } catch (error) {
      const found = archiveBlockersOf({ error });
      setBlockers(found);
      setFailed(!found);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.ministry_roles_archive_title({ name: role.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.ministry_roles_archive_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {blockers ? (
          <ArchiveBlockerList
            heading={m.ministry_roles_archive_blocked()}
            blockers={blockers}
          />
        ) : null}
        {failed ? (
          <p className="text-destructive text-sm" role="alert">
            {m.ministry_roles_archive_failed()}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {m.ministries_cancel()}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending
              ? m.ministry_roles_archiving()
              : m.ministry_roles_archive_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
