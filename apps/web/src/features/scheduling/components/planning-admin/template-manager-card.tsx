import { describeTemplate } from './planning-admin.utils';
import { useTemplateManagerCard } from './planning-admin-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface TemplateManagerCardProps {
  onEditTemplate: () => void;
}

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
          templates.map((template) => (
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
                  variant="ghost"
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
