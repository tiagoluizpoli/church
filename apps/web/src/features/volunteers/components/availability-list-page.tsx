import { m } from '@church/i18n/messages';
import { type CalendarDay, now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { CheckDeadline } from './check-deadline';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import type { ListAvailabilityChecks200ChecksItem as Check } from '@/infrastructure/api/churchAPI.schemas';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { shouldRetry } from '@/utils/api';
import { volunteerApi } from '@/utils/api-instances';

interface CheckProps {
  check: Check;
}

export interface AvailabilityListPageProps {
  /** The check the volunteer just answered, acknowledged until they leave the list. */
  answeredCheckId?: string;
}

/** Marks the row the volunteer just sent, so they see where their answer landed. */
function SentNow() {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-green-700 text-xs dark:text-green-400">
      <CircleCheck aria-hidden className="size-3.5" />
      {m.availability_list_sent_now()}
    </span>
  );
}

interface CheckOnDayProps extends CheckProps {
  churchDay: CalendarDay;
}

const ACTION_SIZE = 'min-h-11 min-w-11 md:min-h-0 md:min-w-0';

function titleOf(check: Check): string {
  return `${check.ministryName} · ${check.cycleName}`;
}

function shiftCount({ check }: CheckProps): string {
  return check.totalShiftCount === 1
    ? m.availability_list_shift_count_one()
    : m.availability_list_shift_count({ count: check.totalShiftCount });
}

/** Says "unavailable" outright instead of "available for 0 of N". */
function answerSummary({ check }: CheckProps): string {
  const total = check.totalShiftCount;
  const available = total - check.unavailableShiftCount;
  if (total === 1)
    return available === 1
      ? m.availability_list_available()
      : m.availability_list_unavailable();
  if (available === 0) return m.availability_list_unavailable_all();
  if (available === total) return m.availability_list_available_all();
  return m.availability_list_available_count({ available, total });
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
      className="border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    >
      {m.availability_list_pending()}
    </Badge>
  );
}

function CheckAction({ check }: CheckProps) {
  const confirmed = check.state === 'confirmed';
  const name = titleOf(check);
  return (
    <div className="flex justify-end max-md:ml-auto md:w-full">
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
          size: 'xs',
          className: ACTION_SIZE,
        })}
      >
        {confirmed
          ? m.availability_list_review()
          : m.availability_list_answer()}
      </Link>
    </div>
  );
}

/** A pending check's Deadline; an answered one shows what the volunteer said. */
function CheckDetail({ check, churchDay }: CheckOnDayProps) {
  return check.state === 'confirmed' ? (
    <p className="text-muted-foreground">{answerSummary({ check })}</p>
  ) : (
    <CheckDeadline check={check} churchDay={churchDay} />
  );
}

function checkColumns(): DataTableColumn[] {
  return [
    {
      id: 'ministry',
      name: m.availability_list_column_ministry(),
      isRowHeader: true,
    },
    { id: 'cycle', name: m.schedules_column_cycle() },
    { id: 'status', name: m.cycles_column_status() },
    { id: 'detail', name: m.availability_list_column_detail() },
    { id: 'actions', name: m.availability_list_column_actions() },
  ];
}

interface CheckTableProps {
  checks: Check[];
  churchDay: CalendarDay;
  answeredCheckId?: string;
}

function CheckTable({ checks, churchDay, answeredCheckId }: CheckTableProps) {
  return (
    <DataTable<Check>
      aria-label={m.nav_availability()}
      columns={checkColumns()}
      items={checks}
      rowId={({ item }) => item.id}
      rowTestId={({ item }) => `availability-check-${item.id}`}
      renderCell={({ item, column }) => {
        switch (column.id) {
          case 'ministry':
            return (
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{item.ministryName}</span>
                {item.id === answeredCheckId ? <SentNow /> : null}
              </span>
            );
          case 'cycle':
            return (
              <span>
                {item.cycleName}
                {item.state === 'pending' ? (
                  <span className="text-muted-foreground">
                    {` · ${shiftCount({ check: item })}`}
                  </span>
                ) : null}
              </span>
            );
          case 'status':
            return <StateBadge check={item} />;
          case 'detail':
            return <CheckDetail check={item} churchDay={churchDay} />;
          default:
            return <CheckAction check={item} />;
        }
      }}
      renderMobileCard={({ item }) => (
        <div className="surface-subtle workspace-panel flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <div className="min-w-0 flex-1 basis-40 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words font-medium">{item.ministryName}</p>
              <StateBadge check={item} />
              {item.id === answeredCheckId ? <SentNow /> : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {item.state === 'pending'
                ? `${item.cycleName} · ${shiftCount({ check: item })}`
                : item.cycleName}
            </p>
            <CheckDetail check={item} churchDay={churchDay} />
          </div>
          <CheckAction check={item} />
        </div>
      )}
    />
  );
}

function AvailabilityListContent({
  answeredCheckId,
}: AvailabilityListPageProps) {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  // The server orders the checks: pending first by Deadline, then answered.
  const checksQuery = useQuery({
    queryKey: ['availability-checks'],
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: (failureCount, error) =>
      shouldRetry({ failureCount, error, serverErrorRetries: 1 }),
    meta: { showsOwnError: true },
  });
  const checks = checksQuery.data?.checks ?? [];
  const counts = checksQuery.data?.counts;
  const pendingCount = counts?.pending ?? 0;
  const answered = checks.find((check) => check.id === answeredCheckId);

  // The empty and error states carry their own message, so no instruction precedes them.
  const description = checksQuery.isError
    ? undefined
    : pendingCount > 0
      ? `${
          pendingCount === 1
            ? m.availability_list_pending_count_one()
            : m.availability_list_pending_count({ count: pendingCount })
        } ${m.availability_list_help()}`
      : checks.length > 0
        ? m.availability_list_all_answered()
        : checksQuery.isSuccess
          ? undefined
          : m.availability_list_description();

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_availability()}
        description={description}
        aside={
          counts && counts.total > 0 ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="availability-total-chip"
                label={m.availability_list_chip_total()}
                value={counts.total}
              />
              <HeaderStatChip
                testId="availability-pending-chip"
                label={m.availability_list_chip_pending()}
                value={counts.pending}
              />
              <HeaderStatChip
                testId="availability-confirmed-chip"
                label={m.availability_list_chip_confirmed()}
                value={counts.confirmed}
              />
            </div>
          ) : undefined
        }
      />
      {answered ? (
        <p
          role="status"
          className="radius-control flex items-center gap-2 bg-green-600/10 p-3 font-medium text-green-700 text-sm dark:text-green-400"
        >
          <CircleCheck aria-hidden className="size-5 shrink-0" />
          {m.availability_list_answered({ ministry: answered.ministryName })}
        </p>
      ) : null}
      {checksQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{m.availability_list_error()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => checksQuery.refetch()}
            >
              {m.common_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : checksQuery.isLoading ? (
        <Pending label={m.availability_list_loading()} className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Pending>
      ) : checks.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          {m.availability_list_empty()}
        </p>
      ) : (
        <Card className="surface-panel">
          <CardContent>
            <CheckTable
              checks={checks}
              churchDay={churchDay}
              answeredCheckId={answeredCheckId}
            />
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}

export function AvailabilityListPage(props: AvailabilityListPageProps) {
  return (
    <CapabilityGate
      allow={(capabilities) => capabilities.hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityListContent {...props} />
    </CapabilityGate>
  );
}
