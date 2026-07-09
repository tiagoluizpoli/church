import {
  describeTemplate,
  toTemplateLibraryTableRow,
} from './planning-admin.utils';
import { useTemplateManagerCard } from './planning-admin-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TemplateManagerCardProps {
  onEditTemplate: () => void;
}

const TEMPLATE_TABLE_COLUMNS = [
  { id: 'name', name: 'Name' },
  { id: 'weekday', name: 'Weekday' },
  { id: 'blocks', name: 'Blocks' },
  { id: 'actions', name: 'Actions' },
] as const;

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
        {templatesLoading ? (
          <p className="text-muted-foreground text-sm">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No templates yet. Use the create action above to start a reusable
            library.
          </p>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="surface-subtle workspace-panel flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                  data-testid="saved-template-row"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {describeTemplate({ template })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      data-testid="open-edit-template-dialog-button"
                      onClick={() => {
                        handleStartEditTemplate({ templateId: template.id });
                        onEditTemplate();
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      data-testid="delete-template-button"
                      disabled={deleteTemplatePending}
                      onClick={() =>
                        handleDeleteTemplate({ templateId: template.id })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table aria-label="Saved templates">
                <TableHeader columns={TEMPLATE_TABLE_COLUMNS}>
                  {(column) => (
                    <TableColumn isRowHeader={column.id === 'name'}>
                      {column.name}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody
                  items={templates.map((template) =>
                    toTemplateLibraryTableRow({ template }),
                  )}
                >
                  {(row) => (
                    <TableRow
                      key={row.id}
                      id={row.id}
                      columns={TEMPLATE_TABLE_COLUMNS}
                    >
                      {(column) => (
                        <TableCell>
                          {column.id === 'name' ? row.name : null}
                          {column.id === 'weekday' ? row.weekday : null}
                          {column.id === 'blocks' ? row.blockCount : null}
                          {column.id === 'actions' ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  handleStartEditTemplate({
                                    templateId: row.id,
                                  });
                                  onEditTemplate();
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="destructive"
                                disabled={deleteTemplatePending}
                                onClick={() =>
                                  handleDeleteTemplate({ templateId: row.id })
                                }
                              >
                                Delete
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
