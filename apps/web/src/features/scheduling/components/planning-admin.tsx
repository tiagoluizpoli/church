import { Badge } from '@church/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { CreateCycleCard } from './planning-admin/create-cycle-card';
import { CycleListCard } from './planning-admin/cycle-list-card';
import { CycleReviewCard } from './planning-admin/cycle-review-card';
import {
  formatCycleDate,
  stateBadgeVariant,
} from './planning-admin/planning-admin.utils';
import {
  PlanningAdminProvider,
  useCycleReviewCard,
  useIsPlanningAccessDenied,
  usePlanningStep,
} from './planning-admin/planning-admin-context';
import { TemplateManagerCard } from './planning-admin/template-manager-card';
import { SchedulingNav } from './scheduling-nav';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';

type PlanningStep = ReturnType<typeof usePlanningStep>;

const STEP_LABELS: Record<PlanningStep, string> = {
  'create-cycle': 'Create cycle',
  'template-and-review': 'Apply templates and review',
  'locked-review': 'Locked review',
};

export function PlanningAdmin() {
  return (
    <PlanningAdminProvider>
      <PlanningAdminView />
    </PlanningAdminProvider>
  );
}

function PlanningAdminView() {
  const step = usePlanningStep();
  const { selectedCycle, totalSlots, cycleEvents } = useCycleReviewCard();

  if (useIsPlanningAccessDenied()) {
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

  return (
    <WorkspacePage data-testid="planning-admin-page">
      <SchedulingNav />

      <WorkspaceIntroPanel
        title="Planning cycles"
        description="Build the church calendar in one guided flow: define the period, generate the recurring rhythm, review one-offs, and lock the cycle when leaders can staff against it."
        aside={
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            <div className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
              {selectedCycle ? (
                <>
                  <span className="font-medium">{selectedCycle.name}</span>
                  <Badge
                    variant={stateBadgeVariant({ state: selectedCycle.state })}
                  >
                    {selectedCycle.state}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatCycleDate({ date: selectedCycle.startDate })} →{' '}
                    {formatCycleDate({ date: selectedCycle.endDate })}
                  </span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-muted-foreground text-xs">
                    {STEP_LABELS[step]}
                  </span>
                </>
              ) : (
                <span className="font-medium">No cycle selected yet</span>
              )}
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
        }
      />

      {step === 'create-cycle' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(18rem,0.55fr)]">
          <CreateCycleCard />
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>What happens next</CardTitle>
              <CardDescription>
                The cycle becomes the planning container for everything that
                follows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
              <p>
                1. Create the date range you want the church to plan as one
                package.
              </p>
              <p>
                2. Save reusable templates for weekly rhythms like Sunday and
                midweek services.
              </p>
              <p>
                3. Review generated events, add exceptions, then lock when the
                calendar is ready.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            {step === 'template-and-review' ? <TemplateManagerCard /> : null}
            <CycleReviewCard isReadOnly={step === 'locked-review'} />
          </div>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle>Cycle management stays nearby</CardTitle>
              <CardDescription>
                Start another cycle or switch context without losing your place
                in the active review flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
              <CreateCycleCard />
              <CycleListCard />
            </CardContent>
          </Card>
        </>
      )}
    </WorkspacePage>
  );
}
