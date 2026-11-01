import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TemplateLibraryTableRow } from './planning-admin.types';
import { toTemplateLibraryTableRow } from './planning-admin.utils';
import { useTemplateManagerCard } from './planning-admin-context';
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

export function TemplateManagerCard() {
  // The list reads the shared template query itself so it can offer retry; the
  // planning-admin context supplies only the legacy delete action.
  const templatesQuery = useQuery({
    queryKey: ['planning-templates'],
    queryFn: () => adminApi.listEventTemplates(),
    retry: false,
  });
  const templates = templatesQuery.data?.templates ?? [];
  const { deleteTemplatePending, handleDeleteTemplate } =
    useTemplateManagerCard();

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
          <div
            className="flex flex-wrap items-center gap-3"
            role="alert"
            data-testid="templates-load-error"
          >
            <p className="text-destructive text-sm">
              {m.event_templates_load_failed()}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => templatesQuery.refetch()}
            >
              {m.event_templates_retry()}
            </Button>
          </div>
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
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/event-templates/$templateId"
                      params={{ templateId: item.id }}
                      className={buttonVariants({
                        size: 'xs',
                        variant: 'outline',
                      })}
                    >
                      {m.event_templates_edit()}
                    </Link>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      disabled={deleteTemplatePending}
                      onClick={() =>
                        handleDeleteTemplate({ templateId: item.id })
                      }
                    >
                      {m.event_templates_delete()}
                    </Button>
                  </div>
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
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/event-templates/$templateId"
                    params={{ templateId: item.id }}
                    data-testid="edit-template-button"
                    className={buttonVariants({
                      size: 'xs',
                      variant: 'outline',
                    })}
                  >
                    {m.event_templates_edit()}
                  </Link>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    data-testid="delete-template-button"
                    disabled={deleteTemplatePending}
                    onClick={() =>
                      handleDeleteTemplate({ templateId: item.id })
                    }
                  >
                    {m.event_templates_delete()}
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
