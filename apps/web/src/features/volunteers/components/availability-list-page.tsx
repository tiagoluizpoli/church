import { m } from '@church/i18n/messages';
import { type CalendarDay, now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { CheckDeadline } from './check-deadline';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { formatDayOf } from '@/shared/utils/church-time';
import { shouldRetry } from '@/utils/api';
import { volunteerApi } from '@/utils/api-instances';

interface CheckProps {
  check: Check;
}

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

interface AnsweredOnProps extends CheckProps {
  churchTimezone: string;
  /** Spells out "Respondida em" where no column header says it. */
  labelled: boolean;
}

function AnsweredOn({ check, churchTimezone, labelled }: AnsweredOnProps) {
  if (!check.confirmedAt) return null;
  const date = formatDayOf({
    value: check.confirmedAt,
    timeZone: churchTimezone,
  });
  return (
    <time dateTime={check.confirmedAt} className="text-muted-foreground">
      {labelled ? m.availability_list_answered_on({ date }) : date}
    </time>
  );
}

function CheckAction({ check }: CheckProps) {
  const confirmed = check.state === 'confirmed';
  const name = titleOf(check);
  return (
    <div className="mt-3 lg:mt-0">
      <Link
        to="/availability/$checkId"
        params={{ checkId: check.id }}
        aria-label={
          confirmed
            ? m.availability_list_review_label({ name })
            : m.availability_list_answer_label({ name })
        }
        // A 44px target on touch layouts, the default 32px button on desktop
        // (volunteers skew older, so no dense 12px row action here).
        className={buttonVariants({
          variant: confirmed ? 'outline' : 'default',
          size: 'touch',
          className: 'min-w-32 lg:h-8 lg:min-w-24 lg:px-3',
        })}
      >
        {confirmed
          ? m.availability_list_review()
          : m.availability_list_answer()}
      </Link>
    </div>
  );
}

interface CheckListProps {
  checks: Check[];
  churchDay: CalendarDay;
  churchTimezone: string;
  label: string;
}

/** One flat row per check on phones and tablets; the action follows it. */
function CheckCard({
  check,
  churchDay,
  churchTimezone,
}: CheckProps & Omit<CheckListProps, 'checks' | 'label'>) {
  const pending = check.state === 'pending';
  return (
    <div className="space-y-1 border-t pt-4 text-sm">
      <h3 className="break-words font-semibold text-base">
        {check.ministryName}
      </h3>
      <p className="text-muted-foreground">
        {pending
          ? `${check.cycleName} · ${shiftCount({ check })}`
          : check.cycleName}
      </p>
      {pending ? (
        <CheckDeadline check={check} churchDay={churchDay} />
      ) : (
        <>
          <p>{answerSummary({ check })}</p>
          <p>
            <AnsweredOn
              check={check}
              churchTimezone={churchTimezone}
              labelled
            />
          </p>
        </>
      )}
    </div>
  );
}

/** The Cycle truncates first so the Ministry, which tells checks apart, stays
 * whole; the Ministry only truncates once the Cycle is gone. */
function NameCell({ check }: CheckProps) {
  return (
    <span className="flex min-w-0" title={titleOf(check)}>
      <span className="min-w-0 truncate font-medium">{check.ministryName}</span>
      <span className="min-w-0 shrink-[1000] truncate whitespace-pre text-muted-foreground">
        {` · ${check.cycleName}`}
      </span>
      {check.state === 'pending' ? (
        <span className="shrink-0 whitespace-pre text-muted-foreground">
          {` · ${shiftCount({ check })}`}
        </span>
      ) : null}
    </span>
  );
}

const nameColumn: DataTableColumn = {
  id: 'ministry',
  name: m.availability_list_column_ministry(),
  isRowHeader: true,
  className: 'w-full max-w-0',
};

// From xl, fixed widths line the two stacked tables up: Prazo spans Sua resposta plus
// Respondida em, and both action columns match.
const deadlineColumn: DataTableColumn = {
  id: 'deadline',
  name: m.availability_list_column_deadline(),
  className: 'whitespace-nowrap xl:w-96',
};
const answerColumns: DataTableColumn[] = [
  {
    id: 'answer',
    name: m.availability_list_column_answer(),
    className: 'whitespace-nowrap xl:w-60',
  },
  {
    id: 'answeredOn',
    name: m.availability_list_column_answered_on(),
    className: 'whitespace-nowrap xl:w-36',
  },
];
const actionsColumn: DataTableColumn = {
  id: 'actions',
  name: m.availability_list_column_actions(),
  className: 'w-32',
};

function CheckList({
  checks,
  churchDay,
  churchTimezone,
  label,
}: CheckListProps) {
  const navigate = useNavigate();
  const pending = checks[0]?.state === 'pending';
  return (
    <DataTable<Check>
      aria-label={label}
      // Tablets keep the touch cards: a 768px workspace can't fit the row.
      tableFrom="lg"
      columns={[
        nameColumn,
        ...(pending ? [deadlineColumn] : answerColumns),
        actionsColumn,
      ]}
      items={checks}
      rowId={({ item }) => item.id}
      rowTestId={({ item }) => `availability-check-${item.id}`}
      onRowAction={({ item }) =>
        navigate({ to: '/availability/$checkId', params: { checkId: item.id } })
      }
      renderCell={({ item, column }) => (
        <>
          {column.id === 'ministry' ? <NameCell check={item} /> : null}
          {column.id === 'deadline' ? (
            <CheckDeadline check={item} churchDay={churchDay} />
          ) : null}
          {column.id === 'answer' ? answerSummary({ check: item }) : null}
          {column.id === 'answeredOn' ? (
            <AnsweredOn
              check={item}
              churchTimezone={churchTimezone}
              labelled={false}
            />
          ) : null}
        </>
      )}
      rowActions={({ item }) => <CheckAction check={item} />}
      renderMobileCard={({ item }) => (
        <CheckCard
          check={item}
          churchDay={churchDay}
          churchTimezone={churchTimezone}
        />
      )}
    />
  );
}

function ListSkeleton() {
  return (
    <Pending label={m.availability_list_loading()} className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </Pending>
  );
}

function AvailabilityListContent() {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const checksQuery = useQuery({
    queryKey: ['availability-checks'],
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: (failureCount, error) =>
      shouldRetry({ failureCount, error, serverErrorRetries: 1 }),
    meta: { showsOwnError: true },
  });
  const checks = checksQuery.data?.checks ?? [];
  // The server orders pending before confirmed, so splitting keeps its order.
  const toAnswer = checks.filter((check) => check.state === 'pending');
  const answered = checks.filter((check) => check.state === 'confirmed');
  const listProps = { churchDay, churchTimezone };

  const description =
    toAnswer.length > 0
      ? `${
          toAnswer.length === 1
            ? m.availability_list_pending_count_one()
            : m.availability_list_pending_count({ count: toAnswer.length })
        } ${m.availability_list_description()}`
      : answered.length > 0
        ? m.availability_list_all_answered()
        : m.availability_list_description();

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_availability()}
        description={description}
      >
        {checksQuery.isLoading ? (
          <ListSkeleton />
        ) : checksQuery.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 border-t pt-4"
          >
            <p className="text-destructive text-sm">
              {m.availability_list_error()}
            </p>
            <Button
              variant="outline"
              size="touch"
              onClick={() => checksQuery.refetch()}
            >
              {m.common_retry()}
            </Button>
          </div>
        ) : checks.length === 0 ? (
          <p className="border-t pt-4 text-muted-foreground text-sm">
            {m.availability_list_empty()}
          </p>
        ) : toAnswer.length > 0 ? (
          <section
            aria-labelledby="availability-to-answer"
            className="space-y-4 pt-2"
          >
            <h2 id="availability-to-answer" className="workspace-section-title">
              {m.availability_list_to_answer()}
            </h2>
            <CheckList
              checks={toAnswer}
              label={m.availability_list_to_answer()}
              {...listProps}
            />
          </section>
        ) : null}
      </WorkspaceIntroPanel>
      {answered.length > 0 ? (
        <section
          aria-labelledby="availability-answered"
          className="surface-panel workspace-panel-lg space-y-4"
        >
          <h2 id="availability-answered" className="workspace-section-title">
            {m.availability_list_answered()}
          </h2>
          <CheckList
            checks={answered}
            label={m.availability_list_answered()}
            {...listProps}
          />
        </section>
      ) : null}
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
