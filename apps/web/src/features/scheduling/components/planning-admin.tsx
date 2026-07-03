import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { CreateCycleCard } from './planning-admin/create-cycle-card';
import { CycleListCard } from './planning-admin/cycle-list-card';
import { CycleReviewCard } from './planning-admin/cycle-review-card';
import {
  PlanningAdminProvider,
  useIsPlanningAccessDenied,
} from './planning-admin/planning-admin-context';
import { TemplateManagerCard } from './planning-admin/template-manager-card';

export function PlanningAdmin() {
  return (
    <PlanningAdminProvider>
      <PlanningAdminView />
    </PlanningAdminProvider>
  );
}

function PlanningAdminView() {
  if (useIsPlanningAccessDenied()) {
    return (
      <Card data-testid="planning-access-denied">
        <CardHeader>
          <CardTitle>Planning is admin-only</CardTitle>
          <CardDescription>
            Draft cycles stay hidden from volunteers. Ask a church admin if you
            need access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="planning-admin-page">
      <div className="space-y-1">
        <h2 className="font-bold text-xl">Planning cycles</h2>
        <p className="text-muted-foreground text-sm">
          Create period, apply reusable templates, review generated events, then
          lock for leaders.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <CreateCycleCard />
        <CycleListCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <TemplateManagerCard />
        <CycleReviewCard />
      </div>
    </div>
  );
}
