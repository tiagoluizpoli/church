import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { ApplyTemplatesDialog } from './planning-admin/apply-templates-dialog';
import { cycleIsLocked } from './planning-admin/planning-admin.utils';
import {
  PlanningAdminProvider,
  useCycleReviewCard,
  useIsPlanningAccessDenied,
  usePlanningCycleHeader,
  usePlanningCycleSelection,
} from './planning-admin/planning-admin-context';
import { PlanningCycleHeader } from './planning-admin/planning-cycle-header';
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

const CYCLES_PATH = '/scheduling/planning-cycles';

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
  if (pathname.endsWith('/templates')) {
    return {
      title: 'Template library',
      description:
        'Keep recurring weekday templates in a dedicated library, then return to a cycle only when you are ready to apply them.',
    };
  }

  if (pathname.endsWith('/new')) {
    return {
      title: 'Create planning cycle',
      description:
        'Define the date range first, then move into review when the cycle is ready for templates and exceptions.',
    };
  }

  if (
    pathname !== CYCLES_PATH &&
    pathname !== `${CYCLES_PATH}/` &&
    selectedCycleName
  ) {
    return {
      title: selectedCycleName,
      description:
        'Planning cycles. Review this cycle, apply templates on demand, add exceptions, and lock the calendar when it is ready for staffing.',
    };
  }

  return {
    title: 'Planning cycles',
    description:
      'Start from the cycle list, open the one you want to review, and only bring template work or cycle creation into view when you need it.',
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

  const pathname = location.pathname;
  const isTemplatesView = pathname.endsWith('/templates');
  const { nameAndStatus } = usePlanningCycleHeader();
  const intro = describePlanningIntro({
    pathname,
    selectedCycleName: nameAndStatus?.name ?? null,
  });

  return (
    <WorkspacePage data-testid="planning-admin-page">
      <WorkspaceIntroPanel
        key={pathname}
        title={intro.title}
        description={intro.description}
        autoFocusTitle
        aside={<PlanningCycleHeader showName={false} />}
      />

      {isTemplatesView ? null : <PlanningCyclesActions pathname={pathname} />}

      <Outlet />
    </WorkspacePage>
  );
}

interface PlanningCyclesActionsProps {
  pathname: string;
}

function PlanningCyclesActions({ pathname }: PlanningCyclesActionsProps) {
  const { selectedCycleId } = usePlanningCycleSelection();
  const { selectedCycle } = useCycleReviewCard();
  const [applyTemplatesOpen, setApplyTemplatesOpen] = useState(false);
  const isReviewingCycle =
    pathname !== CYCLES_PATH &&
    pathname !== `${CYCLES_PATH}/` &&
    !pathname.endsWith('/new');
  const canApplyTemplates =
    isReviewingCycle &&
    Boolean(selectedCycle) &&
    !cycleIsLocked({ cycle: selectedCycle });

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          to="/scheduling/planning-cycles/templates"
          search={
            isReviewingCycle && selectedCycleId
              ? { returnTo: selectedCycleId }
              : undefined
          }
          data-testid="open-template-library-button"
          className={buttonVariants({ variant: 'outline' })}
        >
          Template library
        </Link>
        {canApplyTemplates ? (
          <Button
            type="button"
            data-testid="open-apply-templates-dialog-button"
            onClick={() => setApplyTemplatesOpen(true)}
          >
            Apply template
          </Button>
        ) : null}
        {isReviewingCycle ? null : (
          <Link
            to="/scheduling/planning-cycles/new"
            data-testid="open-create-cycle-dialog-button"
            className={buttonVariants({ variant: 'default' })}
          >
            Create cycle
          </Link>
        )}
      </div>

      {isReviewingCycle && selectedCycle ? (
        <ApplyTemplatesDialog
          open={applyTemplatesOpen}
          onOpenChange={setApplyTemplatesOpen}
          selectedCycleName={selectedCycle.name}
        />
      ) : null}
    </>
  );
}
