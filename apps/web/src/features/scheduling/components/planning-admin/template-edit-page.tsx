import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import type { PlanningTemplateSummary } from './planning-admin.types';
import { RetryAlert } from './retry-alert';
import { TemplateBlockRemovalDialog } from './template-block-removal-dialog';
import { TemplateDeleteDialog } from './template-delete-dialog';
import { TemplateEditorForm } from './template-editor-form';
import { templateDetailQueryKey } from './template-query-keys';
import { useEditTemplate } from './use-edit-template';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { adminApi } from '@/utils/api-instances';

const HTTP_NOT_FOUND = 404;

export interface TemplateEditPageProps {
  templateId: string;
}

interface EditActionsProps {
  disabled: boolean;
  onDelete: () => void;
}

function EditActions({ disabled, onDelete }: EditActionsProps) {
  return (
    <>
      <Link
        to="/event-templates"
        data-testid="cancel-template-button"
        className={buttonVariants({ variant: 'outline' })}
      >
        {m.event_templates_cancel()}
      </Link>
      <Button
        type="button"
        variant="destructive"
        disabled={disabled}
        data-testid="delete-template-button"
        onClick={onDelete}
      >
        {m.event_templates_delete()}
      </Button>
    </>
  );
}

/** Reads its own target, so a direct visit or refresh needs no list state. */
export function TemplateEditPage({ templateId }: TemplateEditPageProps) {
  const templateQuery = useQuery({
    queryKey: templateDetailQueryKey({ templateId }),
    queryFn: () => adminApi.getEventTemplate(templateId),
    retry: false,
  });

  return (
    <Card className="surface-panel" data-testid="template-edit-page">
      <CardHeader>
        <CardTitle>{m.event_templates_edit_title()}</CardTitle>
        <CardDescription>
          {m.event_templates_edit_description()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {templateQuery.data ? (
          <TemplateEditForm template={templateQuery.data} />
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
              <Link to="/event-templates" className={buttonVariants()}>
                {m.event_templates_back_to_list()}
              </Link>
            </div>
          ) : (
            <RetryAlert
              message={m.event_templates_detail_load_failed()}
              testId="template-load-error"
              onRetry={() => templateQuery.refetch()}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm" role="status">
            {m.event_templates_detail_loading()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface TemplateEditFormProps {
  template: PlanningTemplateSummary;
}

function TemplateEditForm({ template }: TemplateEditFormProps) {
  const {
    usageFailed,
    confirmation,
    onConfirmRemoval,
    onCancelRemoval,
    ...editor
  } = useEditTemplate({ template });
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

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
      <TemplateEditorForm
        {...editor}
        actions={
          <EditActions
            disabled={editor.pending}
            onDelete={() => setDeleting(true)}
          />
        }
      />
      {deleting ? (
        <TemplateDeleteDialog
          templateId={template.id}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate({ to: '/event-templates' })}
        />
      ) : null}
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
