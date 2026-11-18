import { m } from '@church/i18n/messages';
import { type CalendarDay, now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckDeadline } from './check-deadline';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import type { ListAvailabilityChecks200ChecksItem as Check } from '@/infrastructure/api/churchAPI.schemas';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

interface CheckProps {
  check: Check;
}

interface CheckOnDayProps extends CheckProps {
  churchDay: CalendarDay;
}

function titleOf(check: Check): string {
  return `${check.ministryName} · ${check.cycleName}`;
}

/** Pending and confirmed use the Traffic-Light Exception's amber and green. */
function StateBadge({ check }: CheckProps) {
  return check.state === 'confirmed' ? (
    <Badge
      variant="outline"
      className="border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
    >
      {m.availability_detail_confirmed()}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
    >
      {m.availability_list_pending()}
    </Badge>
  );
}

function AnswerSummary({ check }: CheckProps) {
  return (
    <span className="text-muted-foreground">
      {check.unavailableShiftCount === 0
        ? m.availability_list_available_all()
        : m.availability_list_unavailable_count({
            unavailable: check.unavailableShiftCount,
            total: check.totalShiftCount,
          })}
    </span>
  );
}

interface CheckActionProps extends CheckProps {
  className: string;
  size: 'sm' | 'touch';
}

function CheckAction({ check, className, size }: CheckActionProps) {
  const confirmed = check.state === 'confirmed';
  const name = titleOf(check);
  return (
    <Link
      to="/availability/$checkId"
      params={{ checkId: check.id }}
      aria-label={
        confirmed
          ? m.availability_list_review_label({ name })
          : m.availability_list_answer_label({ name })
      }
      className={buttonVariants({
        variant: confirmed ? 'outline' : 'default',
        size,
        className,
      })}
    >
      {confirmed ? m.availability_list_review() : m.availability_list_answer()}
    </Link>
  );
}

function DeadlineCell({ check, churchDay }: CheckOnDayProps) {
  if (check.state !== 'confirmed') {
    return <CheckDeadline check={check} churchDay={churchDay} />;
  }
  // Answers stay open until the Cycle ends, so a met Deadline is only a muted fact.
  return check.answerBy ? (
    <time dateTime={check.answerBy} className="text-muted-foreground">
      {formatCalendarDateOnly({ value: check.answerBy })}
    </time>
  ) : null;
}

function CheckCard({ check, churchDay }: CheckOnDayProps) {
  return (
    <div className="surface-subtle workspace-panel space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words font-semibold text-base">
          {titleOf(check)}
        </h2>
        <StateBadge check={check} />
      </div>
      {check.state === 'confirmed' ? (
        <p>
          <AnswerSummary check={check} />
        </p>
      ) : (
        <CheckDeadline check={check} churchDay={churchDay} />
      )}
      <CheckAction check={check} size="touch" className="w-full" />
    </div>
  );
}

interface CheckTableProps {
  checks: Check[];
  churchDay: CalendarDay;
}

function CheckTable({ checks, churchDay }: CheckTableProps) {
  return (
    <DataTable<Check>
      aria-label={m.nav_availability()}
      columns={[
        { id: 'ministry', name: m.schedules_filter(), isRowHeader: true },
        { id: 'cycle', name: m.schedules_column_cycle() },
        { id: 'status', name: m.cycles_column_status() },
        { id: 'deadline', name: m.answers_deadline() },
        { id: 'actions', name: m.people_column_actions() },
      ]}
      items={checks}
      rowId={({ item }) => item.id}
      rowTestId={({ item }) => `availability-check-${item.id}`}
      renderCell={({ item, column }) => {
        switch (column.id) {
          case 'ministry':
            return <span className="font-medium">{item.ministryName}</span>;
          case 'cycle':
            return item.cycleName;
          case 'status':
            return (
              <span className="flex items-center gap-2">
                <StateBadge check={item} />
                {item.state === 'confirmed' ? (
                  <AnswerSummary check={item} />
                ) : null}
              </span>
            );
          case 'deadline':
            return <DeadlineCell check={item} churchDay={churchDay} />;
          default:
            return <CheckAction check={item} size="sm" className="min-w-20" />;
        }
      }}
      renderMobileCard={({ item }) => (
        <CheckCard check={item} churchDay={churchDay} />
      )}
    />
  );
}

function AvailabilityListContent() {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  // The server orders the checks: pending first, then by Deadline and Cycle.
  const checksQuery = useQuery({
    queryKey: ['availability-checks'],
    queryFn: () => volunteerApi.listAvailabilityChecks(),
  });
  const checks = checksQuery.data?.checks ?? [];

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_availability()}
        description={m.availability_list_description()}
      />
      {checksQuery.isLoading ? (
        <Pending label={m.availability_list_loading()} className="space-y-3">
          <Skeleton className="h-32 w-full" />
        </Pending>
      ) : checksQuery.isError ? (
        <div role="alert" className="space-y-3">
          <p>{m.availability_list_error()}</p>
          <Button
            variant="outline"
            size="touch"
            onClick={() => checksQuery.refetch()}
          >
            {m.schedules_retry()}
          </Button>
        </div>
      ) : checks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {m.availability_list_empty()}
        </p>
      ) : (
        <Card className="surface-panel">
          <CardContent>
            <CheckTable checks={checks} churchDay={churchDay} />
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}

export function AvailabilityListPage() {
  return (
    <CapabilityGate
      allow={(capabilities) => capabilities.hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityListContent />
    </CapabilityGate>
  );
}
