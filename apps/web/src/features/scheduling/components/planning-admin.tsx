import { m } from '@church/i18n/messages';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApplyTemplatesDialog } from './planning-admin/apply-templates-dialog';
import { CycleDeleteDialog } from './planning-admin/cycle-delete-dialog';
import {
  CycleHeader,
  CycleListStats,
  PlanningTemplateLibraryStats,
} from './planning-admin/cycle-header';
import { EditCycleDialog } from './planning-admin/edit-cycle-dialog';
import { cycleIsReadOnly } from './planning-admin/planning-admin.utils';
import {
  PlanningAdminProvider,
  useCycleHeader,
  useCycleReviewCard,
  useCycleSelection,
  useIsPlanningAccessDenied,
} from './planning-admin/planning-admin-context';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';

const CYCLES_PATH = '/cycles';

interface PathnameInput {
  pathname: string;
}

function isTemplatesPath({ pathname }: PathnameInput): boolean {
  return pathname.includes('/event-templates');
}

/** A nested Event page under a Cycle, e.g. `/cycles/:id/events/new`. */
function isEventEditorPath({ pathname }: PathnameInput): boolean {
  return pathname.includes('/events/');
}

function isReviewingCyclePath({ pathname }: PathnameInput): boolean {
  return (
    pathname !== CYCLES_PATH &&
    pathname !== `${CYCLES_PATH}/` &&
    !isTemplatesPath({ pathname }) &&
    !isEventEditorPath({ pathname })
  );
}

interface DescribePlanningIntroInput {
  pathname: string;
  selectedCycleName: string | null;
}

interface PlanningIntroContent {
  title: string;
  description: string;
}

function describePlanningIntro({
  pathname,
  selectedCycleName,
}: DescribePlanningIntroInput): PlanningIntroContent {
  if (isTemplatesPath({ pathname })) {
    return {
      title: m.nav_event_templates(),
      description: m.event_templates_description(),
    };
  }

  if (isReviewingCyclePath({ pathname }) && selectedCycleName) {
    return {
      title: selectedCycleName,
      description: m.cycle_review_description(),
    };
  }

  return {
    title: m.cycles_title(),
    description: m.cycles_description(),
  };
}

export function PlanningAdmin() {
  return (
    <PlanningAdminProvider>
      <PlanningAdminLayout />
    </PlanningAdminProvider>
  );
}

function PlanningAdminLayout() {
  const isAccessDenied = useIsPlanningAccessDenied();
  const location = useLocation();

  if (isAccessDenied) {
    return (
      <div className="space-y-5">
        <Card className="surface-panel" data-testid="planning-access-denied">
          <CardHeader>
            <CardTitle>{m.cycles_admin_only_title()}</CardTitle>
            <CardDescription>
              {m.cycles_admin_only_description()}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const pathname = location.pathname;
  const isTemplatesView = isTemplatesPath({ pathname });
  const isPlainListView =
    pathname === CYCLES_PATH || pathname === `${CYCLES_PATH}/`;
  const { nameAndStatus } = useCycleHeader();
  const intro = describePlanningIntro({
    pathname,
    selectedCycleName: nameAndStatus?.name ?? null,
  });

  return (
    <WorkspacePage data-testid="planning-admin-page">
      <WorkspaceIntroPanel
        key={pathname}
        title={intro.title}
        titleTestId={
          nameAndStatus && intro.title === nameAndStatus.name
            ? 'selected-cycle-name'
            : undefined
        }
        description={intro.description}
        autoFocusTitle
        aside={
          isReviewingCyclePath({ pathname }) ? (
            <CycleHeader showName={false} />
          ) : isTemplatesView ? (
            <PlanningTemplateLibraryStats />
          ) : isPlainListView ? (
            <CycleListStats />
          ) : null
        }
      />

      {isTemplatesView || isEventEditorPath({ pathname }) ? null : (
        <CyclesActions pathname={pathname} />
      )}

      <Outlet />
    </WorkspacePage>
  );
}

interface CyclesActionsProps {
  pathname: string;
}

function CyclesActions({ pathname }: CyclesActionsProps) {
  const { selectedCycle, ownedEventCount } = useCycleReviewCard();
  const { handleClearSelectedCycle } = useCycleSelection();
  const navigate = useNavigate();
  const [deleteCycleOpen, setDeleteCycleOpen] = useState(false);
  const [editCycleOpen, setEditCycleOpen] = useState(false);
  const [applyTemplatesOpen, setApplyTemplatesOpen] = useState(false);
  const isReviewingCycle = isReviewingCyclePath({ pathname });
  const canMutateCalendar =
    isReviewingCycle &&
    Boolean(selectedCycle) &&
    !cycleIsReadOnly({ cycle: selectedCycle });
  const canEditDraft = isReviewingCycle && selectedCycle?.state === 'draft';
  const canAddEvent =
    isReviewingCycle &&
    (selectedCycle?.state === 'draft' || selectedCycle?.state === 'sent');

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-end gap-2"
        data-testid="cycles-actions-row"
      >
        {canMutateCalendar ? (
          <Button
            type="button"
            data-testid="open-apply-templates-dialog-button"
            onClick={() => setApplyTemplatesOpen(true)}
          >
            {m.cycles_apply_button()}
          </Button>
        ) : null}
        {canAddEvent && selectedCycle ? (
          <Link
            to="/cycles/$cycleId/events/new"
            params={{ cycleId: selectedCycle.id }}
            data-testid="add-event-link"
            className={buttonVariants()}
          >
            {m.cycles_add_event_button()}
          </Link>
        ) : null}
        {canEditDraft ? (
          <Button
            type="button"
            variant="outline"
            data-testid="edit-cycle-button"
            onClick={() => setEditCycleOpen(true)}
          >
            {m.cycles_edit_button()}
          </Button>
        ) : null}
        {canEditDraft ? (
          <Button
            type="button"
            variant="outline"
            data-testid="delete-cycle-button"
            onClick={() => setDeleteCycleOpen(true)}
          >
            {m.cycles_delete_button()}
          </Button>
        ) : null}
      </div>

      {canEditDraft && selectedCycle ? (
        <EditCycleDialog
          open={editCycleOpen}
          onOpenChange={setEditCycleOpen}
          cycle={{
            id: selectedCycle.id,
            name: selectedCycle.name,
            // The picker edits CalendarDays; the bound's day is its prefix.
            startDate: selectedCycle.startDate.slice(0, 10),
            endDate: selectedCycle.endDate.slice(0, 10),
          }}
        />
      ) : null}

      {canEditDraft && deleteCycleOpen && selectedCycle ? (
        <CycleDeleteDialog
          cycleId={selectedCycle.id}
          cycleName={selectedCycle.name}
          eventCount={ownedEventCount}
          onClose={() => setDeleteCycleOpen(false)}
          onDeleted={() => {
            setDeleteCycleOpen(false);
            handleClearSelectedCycle();
            navigate({ to: CYCLES_PATH });
          }}
        />
      ) : null}

      {isReviewingCycle && selectedCycle ? (
        <ApplyTemplatesDialog
          open={applyTemplatesOpen}
          onOpenChange={setApplyTemplatesOpen}
          cycleId={selectedCycle.id}
          selectedCycleName={selectedCycle.name}
        />
      ) : null}
    </>
  );
}
