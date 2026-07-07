import { Button, buttonVariants } from '@church/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useTemplateEditor } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { TemplateEditorDialog } from '@/features/scheduling/components/planning-admin/template-editor-dialog';
import { TemplateManagerCard } from '@/features/scheduling/components/planning-admin/template-manager-card';

const templatesSearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute('/scheduling/planning-cycles/templates')({
  validateSearch: (search) => templatesSearchSchema.parse(search),
  component: TemplateLibraryRoute,
});

function TemplateLibraryRoute() {
  const { returnTo } = Route.useSearch();
  const {
    handleStartCreateTemplate,
    handleResetTemplateEditor,
    templateSaveSuccessCount,
  } = useTemplateEditor();
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateSaveBaseline, setTemplateSaveBaseline] = useState(0);

  useEffect(() => {
    if (
      templateEditorOpen &&
      templateSaveSuccessCount !== templateSaveBaseline
    ) {
      setTemplateEditorOpen(false);
      handleResetTemplateEditor();
    }
  }, [
    handleResetTemplateEditor,
    templateEditorOpen,
    templateSaveBaseline,
    templateSaveSuccessCount,
  ]);

  const backTo = returnTo
    ? ({
        to: '/scheduling/planning-cycles/$cycleId',
        params: { cycleId: returnTo },
      } as const)
    : ({ to: '/scheduling/planning-cycles' } as const);

  function handleTemplateEditorOpenChange(open: boolean) {
    setTemplateEditorOpen(open);

    if (!open) {
      handleResetTemplateEditor();
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          {...backTo}
          data-testid="back-from-template-library-button"
          className={buttonVariants({ variant: 'outline' })}
        >
          {returnTo ? 'Back to selected cycle' : 'Back to cycles'}
        </Link>
        <Button
          type="button"
          data-testid="open-create-template-dialog-button"
          onClick={() => {
            handleStartCreateTemplate();
            setTemplateSaveBaseline(templateSaveSuccessCount);
            setTemplateEditorOpen(true);
          }}
        >
          Create template
        </Button>
      </div>

      <TemplateManagerCard
        onEditTemplate={() => {
          setTemplateSaveBaseline(templateSaveSuccessCount);
          setTemplateEditorOpen(true);
        }}
      />

      <TemplateEditorDialog
        open={templateEditorOpen}
        onOpenChange={handleTemplateEditorOpenChange}
      />
    </>
  );
}
