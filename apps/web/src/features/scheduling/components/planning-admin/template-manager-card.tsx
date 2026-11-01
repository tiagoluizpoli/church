import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { TemplateLibraryTableRow } from './planning-admin.types';
import { toTemplateLibraryTableRow } from './planning-admin.utils';
import { RetryAlert } from './retry-alert';
import { TemplateDeleteDialog } from './template-delete-dialog';
import { TEMPLATE_LIST_QUERY_KEY } from './template-query-keys';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { adminApi } from '@/utils/api-instances';

function templateTableColumns(): DataTableColumn[] {
  return [
    { id: 'name', name: m.event_templates_column_name(), isRowHeader: true },
    { id: 'weekday', name: m.event_templates_column_weekday() },
    { id: 'blocks', name: m.event_templates_column_blocks() },
    { id: 'actions', name: m.event_templates_column_actions() },
  ];
}

interface TemplateRowActionsProps {
  templateId: string;
  onDelete: () => void;
  /** Only one copy (the mobile card) carries test ids; both are in the DOM. */
  withTestIds?: boolean;
}

function TemplateRowActions({
  templateId,
  onDelete,
  withTestIds,
}: TemplateRowActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to="/event-templates/$templateId"
        params={{ templateId }}
        data-testid={withTestIds ? 'edit-template-button' : undefined}
        className={buttonVariants({ size: 'xs', variant: 'outline' })}
      >
        {m.event_templates_edit()}
      </Link>
      <Button
        type="button"
        size="xs"
        variant="destructive"
        data-testid={withTestIds ? 'delete-template-button' : undefined}
        onClick={onDelete}
      >
        {m.event_templates_delete()}
      </Button>
    </div>
  );
}

export function TemplateManagerCard() {
  const templatesQuery = useQuery({
    queryKey: TEMPLATE_LIST_QUERY_KEY,
    queryFn: () => adminApi.listEventTemplates(),
    retry: false,
  });
  const templates = templatesQuery.data?.templates ?? [];
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const rows: TemplateLibraryTableRow[] = templates.map((template) =>
    toTemplateLibraryTableRow({ template, locale: getLocale() }),
  );

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>{m.event_templates_library_title()}</CardTitle>
        <CardDescription>{m.event_templates_description()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {templatesQuery.isError ? (
          <RetryAlert
            message={m.event_templates_load_failed()}
            testId="templates-load-error"
            onRetry={() => templatesQuery.refetch()}
          />
        ) : (
          <DataTable<TemplateLibraryTableRow>
            aria-label={m.event_templates_library_title()}
            columns={templateTableColumns()}
            items={rows}
            rowId={({ item }) => item.id}
            isLoading={templatesQuery.isLoading}
            loadingContent={
              <p className="text-muted-foreground text-sm">
                {m.event_templates_loading()}
              </p>
            }
            emptyContent={
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground text-sm">
                  {m.event_templates_empty()}
                </p>
                <Link
                  to="/event-templates/new"
                  data-testid="empty-new-template-button"
                  className={buttonVariants({ variant: 'default' })}
                >
                  {m.event_templates_new()}
                </Link>
              </div>
            }
            renderCell={({ item, column }) => (
              <>
                {column.id === 'name' ? item.name : null}
                {column.id === 'weekday' ? item.weekday : null}
                {column.id === 'blocks' ? item.blockCount : null}
                {column.id === 'actions' ? (
                  <TemplateRowActions
                    templateId={item.id}
                    onDelete={() => setDeleteTargetId(item.id)}
                  />
                ) : null}
              </>
            )}
            renderMobileCard={({ item }) => (
              <div
                className="surface-subtle workspace-panel flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                data-testid="saved-template-row"
              >
                <div className="space-y-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {item.description}
                  </div>
                </div>
                <TemplateRowActions
                  templateId={item.id}
                  onDelete={() => setDeleteTargetId(item.id)}
                  withTestIds
                />
              </div>
            )}
          />
        )}
        {deleteTargetId ? (
          <TemplateDeleteDialog
            templateId={deleteTargetId}
            onClose={() => setDeleteTargetId(null)}
            onDeleted={() => setDeleteTargetId(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
