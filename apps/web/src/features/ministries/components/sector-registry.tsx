import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  type ArchiveBlocker,
  ArchiveBlockerList,
  archiveBlockersOf,
} from '@/features/ministries/components/archive-blockers';
import { MinistryNameForm } from '@/features/ministries/components/ministry-name-form';
import {
  invalidateSectorReads,
  useSectorList,
} from '@/features/ministries/ministry-queries';
import type {
  ArchiveSector409,
  ListSectors200SectorsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

type Sector = ListSectors200SectorsItem;

interface SectorRegistryProps {
  ministryId: string;
}

interface SaveInput {
  name: string;
}

/** Which dialog is open; `alternative` archives and then opens Add. */
type Dialogs =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'rename'; sector: Sector }
  | { kind: 'archive'; sector: Sector; alternative: boolean };

/** A Ministry's active Sectors, for ChurchAdmins and its own leaders. */
export function SectorRegistry({ ministryId }: SectorRegistryProps) {
  const queryClient = useQueryClient();
  const sectors = useSectorList({ ministryId });
  const [dialog, setDialog] = useState<Dialogs>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });

  const add = async ({ name }: SaveInput) => {
    await adminApi.createSector(ministryId, { name });
    await invalidateSectorReads({ queryClient });
    toast.success(m.sectors_added_toast());
    close();
  };

  const rename =
    (sector: Sector) =>
    async ({ name }: SaveInput) => {
      await adminApi.renameSector(ministryId, sector.id, { name });
      await invalidateSectorReads({ queryClient });
      toast.success(m.sectors_renamed_toast());
      close();
    };

  return (
    <section className="surface-panel space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-lg">{m.ministry_tab_sectors()}</h2>
        <Button type="button" onClick={() => setDialog({ kind: 'add' })}>
          {m.sectors_add()}
        </Button>
      </div>
      {sectors.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-muted-foreground">{m.sectors_load_failed()}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => sectors.refetch()}
          >
            {m.ministries_retry()}
          </Button>
        </div>
      ) : (
        <DataTable<Sector>
          aria-label={m.ministry_tab_sectors()}
          columns={[
            {
              id: 'name',
              name: m.ministry_tab_sectors(),
              isRowHeader: true,
            },
            {
              id: 'actions',
              name: m.people_column_actions(),
            },
          ]}
          items={sectors.data?.sectors ?? []}
          isLoading={sectors.isPending}
          rowId={({ item }) => item.id}
          renderCell={({ item }) => (
            <span data-testid="sector-name">{item.name}</span>
          )}
          renderMobileCard={({ item }) => (
            <div className="flex items-center justify-between gap-2">
              <span data-testid="sector-name" className="text-sm">
                {item.name}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={m.sectors_rename_label({ name: item.name })}
                  onClick={() => setDialog({ kind: 'rename', sector: item })}
                >
                  {m.sectors_rename()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={m.sectors_archive_label({ name: item.name })}
                  onClick={() =>
                    setDialog({
                      kind: 'archive',
                      sector: item,
                      alternative: false,
                    })
                  }
                >
                  {m.sectors_archive()}
                </Button>
              </div>
            </div>
          )}
          rowActions={({ item }) => (
            <div className="flex w-full justify-end gap-2 max-md:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={m.sectors_rename_label({ name: item.name })}
                onClick={() => setDialog({ kind: 'rename', sector: item })}
              >
                {m.sectors_rename()}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={m.sectors_archive_label({ name: item.name })}
                onClick={() =>
                  setDialog({
                    kind: 'archive',
                    sector: item,
                    alternative: false,
                  })
                }
              >
                {m.sectors_archive()}
              </Button>
            </div>
          )}
          emptyContent={
            <p className="text-muted-foreground text-sm" role="status">
              {m.ministry_sectors_empty()}
            </p>
          }
        />
      )}

      <Dialog
        open={dialog.kind === 'add' || dialog.kind === 'rename'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent showCloseButton={false}>
          {dialog.kind === 'add' ? (
            <>
              <DialogHeader>
                <DialogTitle>{m.sectors_add()}</DialogTitle>
                <DialogDescription>
                  {m.sectors_add_description()}
                </DialogDescription>
              </DialogHeader>
              <MinistryNameForm
                initialName=""
                autoFocus
                onSave={add}
                renderActions={(pending) => (
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={close}
                    >
                      {m.ministries_cancel()}
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? <Spinner /> : null}
                      {m.sectors_add_submit()}
                    </Button>
                  </DialogFooter>
                )}
              />
            </>
          ) : null}
          {dialog.kind === 'rename' ? (
            <>
              <DialogHeader>
                <DialogTitle>{m.sectors_rename_title()}</DialogTitle>
              </DialogHeader>
              <Alert>
                <AlertTitle>{m.sectors_rename_warning_title()}</AlertTitle>
                <AlertDescription>
                  {m.sectors_rename_warning()}
                </AlertDescription>
              </Alert>
              <MinistryNameForm
                key={dialog.sector.id}
                initialName={dialog.sector.name}
                autoFocus
                onSave={rename(dialog.sector)}
                renderActions={(pending) => (
                  <DialogFooter className="sm:justify-between">
                    <Button
                      type="button"
                      variant="link"
                      className="px-0"
                      disabled={pending}
                      onClick={() =>
                        setDialog({
                          kind: 'archive',
                          sector: dialog.sector,
                          alternative: true,
                        })
                      }
                    >
                      {m.sectors_archive_instead()}
                    </Button>
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={close}
                      >
                        {m.ministries_cancel()}
                      </Button>
                      <Button type="submit" disabled={pending}>
                        {pending ? <Spinner /> : null}
                        {m.sectors_rename_submit()}
                      </Button>
                    </span>
                  </DialogFooter>
                )}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {dialog.kind === 'archive' ? (
        <ArchiveSectorDialog
          key={dialog.sector.id}
          ministryId={ministryId}
          sector={dialog.sector}
          alternative={dialog.alternative}
          onClose={close}
          onArchived={() =>
            setDialog(dialog.alternative ? { kind: 'add' } : { kind: 'none' })
          }
        />
      ) : null}
    </section>
  );
}

interface ArchiveSectorDialogProps {
  ministryId: string;
  sector: Sector;
  alternative: boolean;
  onClose: () => void;
  onArchived: () => void;
}

interface Refusal {
  message: string;
  blockers: ArchiveBlocker[];
}

/** Confirmation, then the guarded archive; a blocker keeps the Sector as it is. */
function ArchiveSectorDialog({
  ministryId,
  sector,
  alternative,
  onClose,
  onArchived,
}: ArchiveSectorDialogProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState<Refusal>();

  const archive = async () => {
    setPending(true);
    try {
      await adminApi.archiveSector(ministryId, sector.id);
      await invalidateSectorReads({ queryClient });
      toast.success(m.sectors_archived_toast());
      onArchived();
    } catch (error) {
      const body = isAxiosError<ArchiveSector409>(error)
        ? error.response?.data
        : undefined;
      setRefused({
        message: body?.message ?? m.ministries_save_failed(),
        blockers: archiveBlockersOf({ error }) ?? [],
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.sectors_archive_title({ name: sector.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {alternative
              ? m.sectors_archive_and_create_description()
              : m.sectors_archive_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refused ? (
          refused.blockers.length > 0 ? (
            <ArchiveBlockerList
              heading={refused.message}
              blockers={refused.blockers}
            />
          ) : (
            <p className="text-destructive text-sm" role="alert">
              {refused.message}
            </p>
          )
        ) : null}
        <AlertDialogFooter>
          {refused ? (
            <Button type="button" variant="outline" onClick={onClose}>
              {m.sectors_close()}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
              >
                {m.ministries_cancel()}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={archive}
              >
                {pending ? <Spinner /> : null}
                {pending
                  ? m.sectors_archiving()
                  : alternative
                    ? m.sectors_archive_and_create_confirm()
                    : m.sectors_archive_confirm()}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
