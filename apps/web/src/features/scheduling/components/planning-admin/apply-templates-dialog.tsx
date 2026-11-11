import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { describeTemplate } from './planning-admin.utils';
import { TEMPLATE_LIST_QUERY_KEY } from './template-query-keys';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { pluralMessage } from '@/shared/utils/plural';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

interface ApplyTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  selectedCycleName: string;
}

/** Template id → checked. `null` until the first list of the entry arrives. */
type Selection = Record<string, boolean> | null;

interface ReconcileSelectionInput {
  selection: Selection;
  templateIds: string[];
}

/**
 * Entry checks every template. Later lists keep the admin's choices, drop
 * vanished ids and offer new templates unchecked, so a refetch never changes
 * what a click would apply.
 */
function reconcileSelection({
  selection,
  templateIds,
}: ReconcileSelectionInput): Record<string, boolean> {
  return Object.fromEntries(
    templateIds.map((id) => [id, selection === null ? true : !!selection[id]]),
  );
}

export function ApplyTemplatesDialog({
  open,
  onOpenChange,
  cycleId,
  selectedCycleName,
}: ApplyTemplatesDialogProps) {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: TEMPLATE_LIST_QUERY_KEY,
    queryFn: () => adminApi.listEventTemplates(),
    enabled: open,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const templates = templatesQuery.data?.templates;
  const [selection, setSelection] = useState<Selection>(null);
  const templatesFetching = templatesQuery.isFetching;
  const templatesFailed = templatesQuery.isError;
  const selectionSeeded = selection !== null;

  useEffect(() => {
    if (!open) {
      setSelection(null);
      return;
    }
    // A cached list may predate the entry fetch; wait for the fresh one.
    if (
      templates &&
      (selectionSeeded || (!templatesFetching && !templatesFailed))
    ) {
      setSelection((current) =>
        reconcileSelection({
          selection: current,
          templateIds: templates.map((template) => template.id),
        }),
      );
    }
  }, [open, templates, templatesFetching, templatesFailed, selectionSeeded]);

  function refreshCycle() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
      queryClient.invalidateQueries({ queryKey: ['cycles'] }),
    ]);
  }

  const applyMutation = useMutation({
    mutationFn: (templateIds: string[]) =>
      adminApi.applyPlanningTemplates(cycleId, { templateIds }),
    // A refusal may come from a state this page has not seen yet.
    onError: () => refreshCycle(),
    onSuccess: async (counts) => {
      const { generatedEventCount: events, generatedEventTimeBlockCount } =
        counts;
      await refreshCycle();
      toast.success(
        events === 0 && generatedEventTimeBlockCount === 0
          ? m.cycle_apply_nothing_new()
          : m.cycle_apply_added({
              events: pluralMessage({
                count: events,
                one: m.cycle_apply_events_one,
                other: () => m.cycle_apply_events_other({ count: events }),
              }),
              blocks: pluralMessage({
                count: generatedEventTimeBlockCount,
                one: m.cycle_apply_blocks_one,
                other: () =>
                  m.cycle_apply_blocks_other({
                    count: generatedEventTimeBlockCount,
                  }),
              }),
            }),
      );
      onOpenChange(false);
    },
  });

  // A reopened dialog must not show the previous attempt's failure.
  const { reset: resetMutation } = applyMutation;
  useEffect(() => {
    if (!open) {
      resetMutation();
    }
  }, [open, resetMutation]);

  const checkedIds = Object.entries(selection ?? {})
    .filter(([, checked]) => checked)
    .map(([id]) => id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.cycle_apply_title()}</DialogTitle>
          <DialogDescription>
            {m.cycle_apply_description({ cycleName: selectedCycleName })}
          </DialogDescription>
        </DialogHeader>

        {templatesQuery.isError && selection === null ? (
          <div className="space-y-2">
            <p className="text-destructive text-sm" role="alert">
              {m.cycle_apply_load_failed()}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void templatesQuery.refetch()}
            >
              {m.cycle_apply_retry()}
            </Button>
          </div>
        ) : templates === undefined ? (
          <p className="text-muted-foreground text-sm">
            {m.cycle_apply_loading()}
          </p>
        ) : templates.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-testid="apply-templates-empty"
          >
            {m.cycle_apply_empty()}{' '}
            {/* A new tab keeps this Cycle; focus refetches the list. */}
            <a
              href="/event-templates"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              data-testid="apply-templates-setup-link"
            >
              {m.cycle_apply_empty_link()}
              <span className="sr-only"> {m.sectors_opens_new_tab()}</span>
            </a>
          </p>
        ) : (
          <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
            {templates.map((template) => (
              <Label
                key={template.id}
                className="surface-subtle workspace-panel cursor-pointer items-start gap-3"
                data-testid="apply-template-option"
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  data-testid="template-select-checkbox"
                  checked={selection?.[template.id] ?? false}
                  onCheckedChange={(checked) =>
                    setSelection((current) => ({
                      ...current,
                      [template.id]: checked === true,
                    }))
                  }
                />
                <div className="space-y-1">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {describeTemplate({ template, locale: getLocale() })}
                  </div>
                </div>
              </Label>
            ))}
          </div>
        )}

        {applyMutation.error && (
          <div
            className="text-destructive text-sm"
            data-testid="apply-templates-error"
          >
            {requestErrorMessage(applyMutation.error)}
          </div>
        )}

        <DialogFooter showCloseButton={true}>
          <Button
            type="button"
            data-testid="apply-templates-button"
            disabled={checkedIds.length === 0 || applyMutation.isPending}
            onClick={() => applyMutation.mutate(checkedIds)}
          >
            {applyMutation.isPending
              ? m.cycle_apply_submitting()
              : m.cycle_apply_submit()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
