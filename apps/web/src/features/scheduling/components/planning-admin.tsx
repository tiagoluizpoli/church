import { m } from '@church/i18n/messages';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { ApplyTemplatesDialog } from './planning-admin/apply-templates-dialog';
import {
  CycleHeader,
  CycleListStats,
  PlanningTemplateLibraryStats,
} from './planning-admin/cycle-header';
import { cycleIsSent } from './planning-admin/planning-admin.utils';
import {
  PlanningAdminProvider,
  useCycleHeader,
  useCycleReviewCard,
  useIsPlanningAccessDenied,
} from './planning-admin/planning-admin-context';
import { QuickCreateEventModal } from './quick-create-event-modal';
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

interface IsReviewingCyclePathInput {
  pathname: string;
}

function isTemplatesPath({ pathname }: IsReviewingCyclePathInput): boolean {
  return pathname.includes('/event-templates');
}

function isReviewingCyclePath({
  pathname,
}: IsReviewingCyclePathInput): boolean {
  return (
    pathname !== CYCLES_PATH &&
    pathname !== `${CYCLES_PATH}/` &&
    !pathname.endsWith('/new') &&
    !isTemplatesPath({ pathname })
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

  if (
    pathname !== CYCLES_PATH &&
    pathname !== `${CYCLES_PATH}/` &&
    selectedCycleName
  ) {
    return {
      title: selectedCycleName,
      description:
        'Cycles. Review this cycle, apply templates on demand, add exceptions, and send the cycle to Ministries when it is ready for staffing.',
    };
  }

  return {
    title: 'Cycles',
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

      {isTemplatesView ? null : <CyclesActions pathname={pathname} />}

      <Outlet />
    </WorkspacePage>
  );
}

interface CyclesActionsProps {
  pathname: string;
}

function CyclesActions({ pathname }: CyclesActionsProps) {
  const { selectedCycle } = useCycleReviewCard();
  const [applyTemplatesOpen, setApplyTemplatesOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const isReviewingCycle = isReviewingCyclePath({ pathname });
  const canMutateCalendar =
    isReviewingCycle &&
    Boolean(selectedCycle) &&
    !cycleIsSent({ cycle: selectedCycle });

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-end gap-2"
        data-testid="cycles-actions-row"
      >
        <Link
          to="/event-templates"
          data-testid="open-template-library-button"
          className={buttonVariants({ variant: 'outline' })}
        >
          Template library
        </Link>
        {canMutateCalendar ? (
          <Button
            type="button"
            data-testid="open-apply-templates-dialog-button"
            onClick={() => setApplyTemplatesOpen(true)}
          >
            Apply template
          </Button>
        ) : null}
        {canMutateCalendar ? (
          <Button type="button" onClick={() => setCreateEventOpen(true)}>
            Add event
          </Button>
        ) : null}
        {isReviewingCycle ? null : (
          <Link
            to="/cycles/new"
            data-testid="open-create-cycle-dialog-button"
            className={buttonVariants({ variant: 'default' })}
          >
            Create cycle
          </Link>
        )}
      </div>

      {isReviewingCycle && selectedCycle ? (
        <>
          <ApplyTemplatesDialog
            open={applyTemplatesOpen}
            onOpenChange={setApplyTemplatesOpen}
            selectedCycleName={selectedCycle.name}
          />
          <QuickCreateEventModal
            open={createEventOpen}
            onOpenChange={setCreateEventOpen}
            cycleId={selectedCycle.id}
            onCreated={() => undefined}
          />
        </>
      ) : null}
    </>
  );
}
