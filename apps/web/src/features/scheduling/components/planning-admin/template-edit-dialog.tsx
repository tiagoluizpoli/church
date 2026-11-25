import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlanningTemplateSummary } from './planning-admin.types';
import { RetryAlert } from './retry-alert';
import { TemplateBlockRemovalDialog } from './template-block-removal-dialog';
import { TemplateCollisionDialog } from './template-collision-dialog';
import {
  TemplateEditorFooter,
  TemplateEditorForm,
} from './template-editor-form';
import { TemplateLeaveDialog } from './template-leave-dialog';
import { templateDetailQueryKey } from './template-query-keys';
import { useEditTemplate } from './use-edit-template';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/utils/api-instances';

const HTTP_NOT_FOUND = 404;

export interface TemplateEditDialogProps {
  templateId: string;
}

interface EditSurfaceProps {
  onClose: () => void;
  closeDisabled?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

function EditSurface({
  onClose,
  closeDisabled,
  footer,
  children,
}: EditSurfaceProps) {
  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      wide
      closeDisabled={closeDisabled}
      title={m.event_templates_edit_title()}
      description={m.event_templates_edit_description()}
      data-testid="template-edit-dialog"
      footer={footer}
    >
      {children}
    </ResponsiveFormSurface>
  );
}

/**
 * Route-driven: open while `/app/event-templates/$templateId` is, closing
 * returns to the list. Reads its own target, so a direct visit or refresh
 * needs no list state.
 */
export function TemplateEditDialog({ templateId }: TemplateEditDialogProps) {
  const navigate = useNavigate();
  const close = () => navigate({ to: '/app/event-templates', replace: true });
  const templateQuery = useQuery({
    queryKey: templateDetailQueryKey({ templateId }),
    queryFn: () => adminApi.getEventTemplate(templateId),
  });

  // One surface for every state, so loading → loaded never re-opens the dialog;
  // the loaded form renders its own Cancel/Save into this footer slot.
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <EditSurface
      onClose={close}
      closeDisabled={pending}
      footer={
        templateQuery.data ? (
          <div ref={setFooterSlot} className="contents" />
        ) : undefined
      }
    >
      {templateQuery.data ? (
        <TemplateEditForm
          template={templateQuery.data}
          footerSlot={footerSlot}
          onPendingChange={setPending}
          onClose={close}
        />
      ) : templateQuery.isError ? (
        isAxiosError(templateQuery.error) &&
        templateQuery.error.response?.status === HTTP_NOT_FOUND ? (
          <div
            className="flex flex-col items-start gap-3"
            data-testid="template-not-found"
          >
            <p className="text-muted-foreground text-sm">
              {m.event_templates_not_found()}
            </p>
            <Button type="button" onClick={close}>
              {m.event_templates_back_to_list()}
            </Button>
          </div>
        ) : (
          <RetryAlert
            message={m.event_templates_detail_load_failed()}
            testId="template-load-error"
            onRetry={() => templateQuery.refetch()}
          />
        )
      ) : (
        <Pending
          label={m.event_templates_detail_loading()}
          className="space-y-3"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </Pending>
      )}
    </EditSurface>
  );
}

interface TemplateEditFormProps {
  template: PlanningTemplateSummary;
  footerSlot: HTMLDivElement | null;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}

function TemplateEditForm({
  template,
  footerSlot,
  onPendingChange,
  onClose,
}: TemplateEditFormProps) {
  const {
    usageFailed,
    confirmation,
    onConfirmRemoval,
    onCancelRemoval,
    collisionDialog,
    leaveBlocker,
    ...editor
  } = useEditTemplate({ template });

  useEffect(() => {
    onPendingChange(editor.pending);
  }, [editor.pending, onPendingChange]);

  return (
    <>
      {usageFailed ? (
        <RetryAlert
          className="mb-4"
          message={m.event_templates_usage_failed()}
          testId="template-usage-error"
          disabled={editor.pending}
          onRetry={editor.onSave}
        />
      ) : null}
      <TemplateEditorForm {...editor} />
      {footerSlot
        ? createPortal(
            <TemplateEditorFooter {...editor} onCancel={onClose} />,
            footerSlot,
          )
        : null}
      <TemplateCollisionDialog {...collisionDialog} />
      <TemplateLeaveDialog blocker={leaveBlocker} pending={editor.pending} />
      <TemplateBlockRemovalDialog
        blocks={confirmation ?? []}
        open={confirmation !== null}
        pending={editor.pending}
        onConfirm={onConfirmRemoval}
        onCancel={onCancelRemoval}
      />
    </>
  );
}
