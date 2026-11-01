import { m } from '@church/i18n/messages';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { useTemplateEditor } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { TemplateEditorDialog } from '@/features/scheduling/components/planning-admin/template-editor-dialog';
import { TemplateManagerCard } from '@/features/scheduling/components/planning-admin/template-manager-card';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/event-templates/',
)({
  component: TemplateLibraryRoute,
});

function TemplateLibraryRoute() {
  // Edit still opens the legacy dialog until its nested page replaces it.
  const { handleResetTemplateEditor, templateSaveSuccessCount } =
    useTemplateEditor();
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveBaseline, setSaveBaseline] = useState(0);

  useEffect(() => {
    if (editorOpen && templateSaveSuccessCount !== saveBaseline) {
      setEditorOpen(false);
      handleResetTemplateEditor();
    }
  }, [
    editorOpen,
    handleResetTemplateEditor,
    saveBaseline,
    templateSaveSuccessCount,
  ]);

  function handleEditorOpenChange(open: boolean) {
    setEditorOpen(open);
    if (!open) {
      handleResetTemplateEditor();
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Link
          to="/event-templates/new"
          data-testid="new-template-button"
          className={buttonVariants()}
        >
          {m.event_templates_new()}
        </Link>
      </div>

      <TemplateManagerCard
        onEditTemplate={() => {
          setSaveBaseline(templateSaveSuccessCount);
          setEditorOpen(true);
        }}
      />

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={handleEditorOpenChange}
      />
    </>
  );
}
