import type { TemplateLibraryTableRow } from './planning-admin.types';
import { toTemplateLibraryTableRow } from './planning-admin.utils';
import { useTemplateManagerCard } from './planning-admin-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

interface TemplateManagerCardProps {
  onEditTemplate: () => void;
}

interface StartEditTemplateInput {
  templateId: string;
}

const TEMPLATE_TABLE_COLUMNS: DataTableColumn[] = [
  { id: 'name', name: 'Name', isRowHeader: true },
  { id: 'weekday', name: 'Weekday' },
  { id: 'blocks', name: 'Blocks' },
  { id: 'actions', name: 'Actions' },
];

export function TemplateManagerCard({
  onEditTemplate,
}: TemplateManagerCardProps) {
  const {
    templates,
    templatesLoading,
    deleteTemplatePending,
    handleDeleteTemplate,
    handleStartEditTemplate,
  } = useTemplateManagerCard();

  const rows: TemplateLibraryTableRow[] = templates.map((template) =>
    toTemplateLibraryTableRow({ template }),
  );

  function startEditTemplate({ templateId }: StartEditTemplateInput): void {
    handleStartEditTemplate({ templateId });
    onEditTemplate();
  }

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Saved templates</CardTitle>
        <CardDescription>
          Review the reusable rhythms you have already saved, then open one only
          when you want to create or edit it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DataTable<TemplateLibraryTableRow>
          aria-label="Saved templates"
          columns={TEMPLATE_TABLE_COLUMNS}
          items={rows}
          rowId={({ item }) => item.id}
          isLoading={templatesLoading}
          loadingContent={
            <p className="text-muted-foreground text-sm">Loading templates…</p>
          }
          emptyContent={
            <p className="text-muted-foreground text-sm">
              No templates yet. Use the create action above to start a reusable
              library.
            </p>
          }
          renderCell={({ item, column }) => (
            <>
              {column.id === 'name' ? item.name : null}
              {column.id === 'weekday' ? item.weekday : null}
              {column.id === 'blocks' ? item.blockCount : null}
              {column.id === 'actions' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => startEditTemplate({ templateId: item.id })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={deleteTemplatePending}
                    onClick={() =>
                      handleDeleteTemplate({ templateId: item.id })
                    }
                  >
                    Delete
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
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  data-testid="open-edit-template-dialog-button"
                  onClick={() => startEditTemplate({ templateId: item.id })}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  data-testid="delete-template-button"
                  disabled={deleteTemplatePending}
                  onClick={() => handleDeleteTemplate({ templateId: item.id })}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}
