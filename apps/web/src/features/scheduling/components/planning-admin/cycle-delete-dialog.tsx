import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { getErrorMessage } from './planning-admin.utils';
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
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

export interface CycleDeleteDialogProps {
  cycleId: string;
  cycleName: string;
  /** Current-read count of owned Events, informational only. */
  eventCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

/** Confirms the hard deletion of a Draft Cycle; a failure keeps the dialog for retry. */
export function CycleDeleteDialog({
  cycleId,
  cycleName,
  eventCount,
  onClose,
  onDeleted,
}: CycleDeleteDialogProps) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => adminApi.deleteCycle(cycleId),
    onError: async () => {
      // A refusal may come from a state this page has not seen yet.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['cycle-details', cycleId] });
      await queryClient.invalidateQueries({ queryKey: ['cycles'] });
      toast.success(m.cycles_deleted_toast());
      onDeleted();
    },
  });

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <AlertDialogContent data-testid="cycle-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.cycles_delete_title({ name: cycleName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.cycles_delete_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm" data-testid="cycle-delete-count">
          {eventCount === 0
            ? m.cycles_delete_count_zero()
            : pluralMessage({
                count: eventCount,
                one: m.cycles_delete_count_one,
                other: () => m.cycles_delete_count_other({ count: eventCount }),
              })}
        </p>
        {remove.isError ? (
          <p
            className="text-destructive text-sm"
            role="alert"
            data-testid="cycle-delete-error"
          >
            {isAxiosError(remove.error) && remove.error.response
              ? getErrorMessage({ error: remove.error })
              : m.cycles_delete_failed()}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {m.cycles_delete_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            data-testid="confirm-cycle-delete-button"
            onClick={(event) => {
              // Keep the dialog open until the mutation settles.
              event.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending
              ? m.cycles_delete_pending()
              : m.cycles_delete_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
