import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import type { PlanningTemplateSummary } from './planning-admin.types';
import { TemplateBlockRemovalDialog } from './template-block-removal-dialog';
import { TemplateEditorForm } from './template-editor-form';
import { templateDetailQueryKey, useEditTemplate } from './use-edit-template';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { adminApi } from '@/utils/api-instances';

export interface TemplateEditPageProps {
  templateId: string;
}

function BackToListLink() {
  return (
    <Link
      to="/event-templates"
      data-testid="cancel-template-button"
      className={buttonVariants({ variant: 'outline' })}
    >
      {m.event_templates_cancel()}
    </Link>
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
          templateQuery.error.response?.status === 404 ? (
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
            <div
              className="flex flex-wrap items-center gap-3"
              role="alert"
              data-testid="template-load-error"
            >
              <p className="text-destructive text-sm">
                {m.event_templates_detail_load_failed()}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => templateQuery.refetch()}
              >
                {m.event_templates_retry()}
              </Button>
            </div>
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

  return (
    <>
      {usageFailed ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-3"
          role="alert"
          data-testid="template-usage-error"
        >
          <p className="text-destructive text-sm">
            {m.event_templates_usage_failed()}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={editor.pending}
            onClick={editor.onSave}
          >
            {m.event_templates_retry()}
          </Button>
        </div>
      ) : null}
      <TemplateEditorForm {...editor} actions={<BackToListLink />} />
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
