import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  templateDetailQueryKey,
  templateUsageQueryKey,
} from './use-edit-template';
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
import { adminApi } from '@/utils/api-instances';

export interface TemplateDeleteDialogProps {
  /** Mount only while a delete is being attempted, so each attempt reads fresh usage. */
  templateId: string;
  onClose: () => void;
  onDeleted: () => void;
}

/** Confirms deletion with the distinct-Ministry count; never deletes on an unread count. */
export function TemplateDeleteDialog({
  templateId,
  onClose,
  onDeleted,
}: TemplateDeleteDialogProps) {
  const queryClient = useQueryClient();
  const usage = useQuery({
    queryKey: templateUsageQueryKey({ templateId }),
    queryFn: () => adminApi.getEventTemplateUsage(templateId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteEventTemplate(templateId),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: templateDetailQueryKey({ templateId }),
      });
      await queryClient.invalidateQueries({ queryKey: ['planning-templates'] });
      toast.success(m.event_templates_deleted_toast());
      onDeleted();
    },
  });

  const count = usage.data?.ministryCount ?? 0;
  const usageReady = usage.isSuccess && !usage.isFetching;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <AlertDialogContent data-testid="template-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.event_templates_delete_title()}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.event_templates_delete_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {usage.isError ? (
          <div
            className="flex flex-wrap items-center gap-3"
            role="alert"
            data-testid="template-delete-usage-error"
          >
            <p className="text-destructive text-sm">
              {m.event_templates_delete_usage_failed()}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => usage.refetch()}
            >
              {m.event_templates_retry()}
            </Button>
          </div>
        ) : usageReady ? (
          count > 0 ? (
            <p className="text-sm" data-testid="template-delete-count">
              {count === 1
                ? m.event_templates_delete_count_one()
                : m.event_templates_delete_count_other({ count })}
            </p>
          ) : null
        ) : (
          <p className="text-muted-foreground text-sm" role="status">
            {m.event_templates_delete_usage_loading()}
          </p>
        )}
        {remove.isError ? (
          <p
            className="text-destructive text-sm"
            role="alert"
            data-testid="template-delete-error"
          >
            {m.event_templates_delete_failed()}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {m.event_templates_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!usageReady || remove.isPending}
            data-testid="confirm-template-delete-button"
            onClick={() => remove.mutate()}
          >
            {m.event_templates_delete_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
