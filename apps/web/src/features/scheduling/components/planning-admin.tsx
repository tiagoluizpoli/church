import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { useEffect, useState } from 'react';
import { ApplyTemplatesDialog } from './planning-admin/apply-templates-dialog';
import { CreateCycleForm } from './planning-admin/create-cycle-form';
import { CycleListCard } from './planning-admin/cycle-list-card';
import { CycleReviewCard } from './planning-admin/cycle-review-card';
import {
  cycleIsLocked,
  formatCycleDate,
  stateBadgeVariant,
} from './planning-admin/planning-admin.utils';
import {
  PlanningAdminProvider,
  useCycleReviewCard,
  useIsPlanningAccessDenied,
  useTemplateEditor,
  useTemplateManagerCard,
} from './planning-admin/planning-admin-context';
import { TemplateEditorDialog } from './planning-admin/template-editor-dialog';
import { TemplateManagerCard } from './planning-admin/template-manager-card';
import { SchedulingNav } from './scheduling-nav';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';

type PlanningWorkspaceView = 'cycles' | 'review' | 'templates';

export function PlanningAdmin() {
  return (
    <PlanningAdminProvider>
      <PlanningAdminView />
    </PlanningAdminProvider>
  );
}

function PlanningAdminView() {
  const { selectedCycleId, selectedCycle, totalSlots, cycleEvents } =
    useCycleReviewCard();
  const { templates } = useTemplateManagerCard();
  const {
    handleResetTemplateEditor,
    handleStartCreateTemplate,
    templateSaveSuccessCount,
  } = useTemplateEditor();
  const isAccessDenied = useIsPlanningAccessDenied();
  const [activeView, setActiveView] = useState<PlanningWorkspaceView>('cycles');
  const [templateReturnView, setTemplateReturnView] =
    useState<Exclude<PlanningWorkspaceView, 'templates'>>('cycles');
  const [createCycleOpen, setCreateCycleOpen] = useState(false);
  const [applyTemplatesOpen, setApplyTemplatesOpen] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [createCycleSelectionBaseline, setCreateCycleSelectionBaseline] =
    useState<string | null>(null);
  const [templateSaveBaseline, setTemplateSaveBaseline] = useState(0);

  useEffect(() => {
    if (activeView === 'review' && !selectedCycleId) {
      setActiveView('cycles');
    }
  }, [activeView, selectedCycleId]);

  useEffect(() => {
    if (
      createCycleOpen &&
      selectedCycleId !== null &&
      selectedCycleId !== createCycleSelectionBaseline
    ) {
      setCreateCycleOpen(false);
      setActiveView('review');
    }
  }, [createCycleOpen, createCycleSelectionBaseline, selectedCycleId]);

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

  if (isAccessDenied) {
    return (
      <div className="space-y-5">
        <SchedulingNav />
        <Card className="surface-panel" data-testid="planning-access-denied">
          <CardHeader>
            <CardTitle>Planning is admin-only</CardTitle>
            <CardDescription>
              Draft cycles stay hidden from volunteers. Ask a church admin if
              you need access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const reviewIsReadOnly = cycleIsLocked({ cycle: selectedCycle });
  const introDescription =
    activeView === 'templates'
      ? 'Keep recurring weekday templates in a dedicated library, then return to a cycle only when you are ready to apply them.'
      : activeView === 'review'
        ? 'Review one selected cycle at a time, apply templates on demand, add exceptions, and lock the calendar when it is ready for staffing.'
        : 'Start from the cycle list, open the one you want to review, and only bring template work or cycle creation into view when you need it.';
  const asideContent =
    activeView === 'review' && selectedCycle ? (
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
        <div className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
          <span className="font-medium">{selectedCycle.name}</span>
          <Badge variant={stateBadgeVariant({ state: selectedCycle.state })}>
            {selectedCycle.state}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {formatCycleDate({ date: selectedCycle.startDate })} →{' '}
            {formatCycleDate({ date: selectedCycle.endDate })}
          </span>
        </div>
        <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Events</span>{' '}
          <span className="font-medium">{cycleEvents.length}</span>
        </div>
        <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Slots</span>{' '}
          <span className="font-medium">{totalSlots}</span>
        </div>
      </div>
    ) : (
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
        <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Templates</span>{' '}
          <span className="font-medium">{templates.length}</span>
        </div>
      </div>
    );

  function handleTemplateEditorOpenChange(open: boolean) {
    setTemplateEditorOpen(open);

    if (!open) {
      handleResetTemplateEditor();
    }
  }

  return (
    <WorkspacePage data-testid="planning-admin-page">
      <SchedulingNav />

      <WorkspaceIntroPanel
        title="Planning cycles"
        description={introDescription}
        aside={asideContent}
      >
        <div className="flex flex-wrap gap-2">
          {activeView === 'review' ? (
            <Button
              type="button"
              variant="outline"
              data-testid="back-to-cycle-list-button"
              onClick={() => setActiveView('cycles')}
            >
              Back to cycles
            </Button>
          ) : null}
          {activeView === 'templates' ? (
            <Button
              type="button"
              variant="outline"
              data-testid="back-from-template-library-button"
              onClick={() => setActiveView(templateReturnView)}
            >
              {templateReturnView === 'review'
                ? 'Back to selected cycle'
                : 'Back to cycles'}
            </Button>
          ) : null}
          {activeView === 'templates' ? (
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
          ) : null}
          {activeView !== 'templates' ? (
            <Button
              type="button"
              variant="outline"
              data-testid="open-template-library-button"
              onClick={() => {
                setTemplateReturnView(
                  activeView === 'review' ? 'review' : 'cycles',
                );
                setActiveView('templates');
              }}
            >
              Template library
            </Button>
          ) : null}
          {activeView === 'review' && !reviewIsReadOnly ? (
            <Button
              type="button"
              data-testid="open-apply-templates-dialog-button"
              onClick={() => setApplyTemplatesOpen(true)}
            >
              Apply template
            </Button>
          ) : null}
          {activeView !== 'templates' ? (
            <Button
              type="button"
              variant={activeView === 'cycles' ? 'default' : 'outline'}
              data-testid="open-create-cycle-dialog-button"
              onClick={() => {
                setCreateCycleSelectionBaseline(selectedCycleId);
                setCreateCycleOpen(true);
              }}
            >
              Create cycle
            </Button>
          ) : null}
        </div>
      </WorkspaceIntroPanel>

      {activeView === 'templates' ? (
        <TemplateManagerCard
          onEditTemplate={() => {
            setTemplateSaveBaseline(templateSaveSuccessCount);
            setTemplateEditorOpen(true);
          }}
        />
      ) : activeView === 'review' ? (
        <CycleReviewCard isReadOnly={reviewIsReadOnly} />
      ) : (
        <CycleListCard
          selectedCycleId={selectedCycleId}
          onSelectCycle={() => setActiveView('review')}
        />
      )}

      <Dialog open={createCycleOpen} onOpenChange={setCreateCycleOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create cycle</DialogTitle>
            <DialogDescription>
              Define the date range first, then move into review when the cycle
              is ready for templates and exceptions.
            </DialogDescription>
          </DialogHeader>
          <CreateCycleForm submitButtonClassName="w-full justify-center sm:w-auto" />
        </DialogContent>
      </Dialog>

      <TemplateEditorDialog
        open={templateEditorOpen}
        onOpenChange={handleTemplateEditorOpenChange}
      />

      {selectedCycle ? (
        <ApplyTemplatesDialog
          open={applyTemplatesOpen}
          onOpenChange={setApplyTemplatesOpen}
          selectedCycleName={selectedCycle.name}
        />
      ) : null}
    </WorkspacePage>
  );
}
