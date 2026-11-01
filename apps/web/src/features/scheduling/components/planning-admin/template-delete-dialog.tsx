import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RetryAlert } from './retry-alert';
import {
  TEMPLATE_LIST_QUERY_KEY,
  templateDetailQueryKey,
  templateUsageQueryKey,
  USUAL_SETUP_QUERY_KEY,
} from './template-query-keys';
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
      for (const queryKey of [
        templateDetailQueryKey({ templateId }),
        templateUsageQueryKey({ templateId }),
      ]) {
        queryClient.removeQueries({ queryKey });
      }
      await Promise.all(
        [TEMPLATE_LIST_QUERY_KEY, USUAL_SETUP_QUERY_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
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
          <RetryAlert
            message={m.event_templates_delete_usage_failed()}
            testId="template-delete-usage-error"
            onRetry={() => usage.refetch()}
          />
        ) : usageReady ? (
          count > 0 ? (
            <p className="text-sm" data-testid="template-delete-count">
              {pluralMessage({
                count,
                one: m.event_templates_delete_count_one,
                other: () => m.event_templates_delete_count_other({ count }),
              })}
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
