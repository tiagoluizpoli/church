import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import type {
  ListSchedules200SchedulesItem,
  ListSchedules200SchedulesItemStage,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { adminApi } from '@/utils/api-instances';

export function SchedulesListPage() {
  const { isChurchAdmin } = useCallerCapabilities();
  const [ministryId, setMinistryId] = useState('all');
  const schedulesQuery = useQuery({
    queryKey: ['prepare-schedules'],
    queryFn: () => adminApi.listSchedules(),
    retry: false,
  });
  const errorStatus = isAxiosError(schedulesQuery.error)
    ? schedulesQuery.error.response?.status
    : undefined;
  const schedules = schedulesQuery.data?.schedules ?? [];
  const ministries = [
    ...new Map(
      schedules.map((row) => [row.ministry.id, row.ministry]),
    ).values(),
  ];
  const filtered = schedules.filter(
    (row) => ministryId === 'all' || row.ministry.id === ministryId,
  );
  const current = filtered.filter((row) => row.cycle.state !== 'past');
  current.sort(
    (left, right) =>
      STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage),
  );
  const past = filtered.filter((row) => row.cycle.state === 'past');
  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.schedules_title()}
        description={m.schedules_description()}
        autoFocusTitle
      />
      {schedulesQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {errorStatus === 403 ? (
              m.shell_no_access()
            ) : errorStatus === 404 ? (
              m.error_not_found()
            ) : (
              <>
                <span>{m.schedules_error()}</span>
                <Button
                  variant="outline"
                  onClick={() => schedulesQuery.refetch()}
                >
                  {m.schedules_retry()}
                </Button>
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : schedulesQuery.isPending ? (
        <output className="grid gap-2">
          <span className="sr-only">{m.schedules_loading()}</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </output>
      ) : schedules.length === 0 ? (
        <p className="text-muted-foreground">{m.schedules_empty()}</p>
      ) : (
        <>
          {(isChurchAdmin || ministries.length > 1) && (
            <Select
              value={ministryId}
              onValueChange={(value) => setMinistryId(value ?? 'all')}
            >
              <SelectTrigger aria-label={m.schedules_filter()}>
                <SelectValue>
                  {ministryId === 'all'
                    ? m.schedules_all_ministries()
                    : ministries.find((ministry) => ministry.id === ministryId)
                        ?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    {m.schedules_all_ministries()}
                  </SelectItem>
                  {ministries.map((ministry) => (
                    <SelectItem key={ministry.id} value={ministry.id}>
                      {ministry.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <ScheduleRows schedules={current} />
          {past.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="ghost" />}>
                {m.schedules_past()}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScheduleRows schedules={past} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </WorkspacePage>
  );
}

const STAGE_ORDER: ListSchedules200SchedulesItemStage[] = [
  'to_prepare',
  'asking',
  'assigning',
  'published',
  'not_serving',
];

interface ScheduleRowsProps {
  schedules: ListSchedules200SchedulesItem[];
}

function stageLabel(row: ListSchedules200SchedulesItem): string {
  switch (row.stage) {
    case 'to_prepare':
      return m.schedules_to_prepare();
    case 'asking':
      return row.asking
        ? m.schedules_asking(row.asking)
        : m.schedules_asking_stage();
    case 'assigning':
      return m.schedules_assigning();
    case 'published':
      return row.affectedVolunteerCount > 0
        ? m.schedules_unsent({ count: row.affectedVolunteerCount })
        : m.schedules_published();
    case 'not_serving':
      return m.schedules_not_serving();
  }
}

function ScheduleRows({ schedules }: ScheduleRowsProps) {
  return (
    <ul className="grid gap-2">
      {schedules.map((row) => (
        <li key={`${row.ministry.id}:${row.cycle.id}`}>
          <Link
            to="/schedules/$ministryId/$cycleId"
            params={{ ministryId: row.ministry.id, cycleId: row.cycle.id }}
            className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>
              {row.ministry.name} · {row.cycle.name}
            </span>
            <span className="flex items-center gap-2">
              {row.lateMarkCount > 0 ? (
                <Badge
                  variant="outline"
                  aria-label={m.schedule_late_mark_count({
                    count: row.lateMarkCount,
                  })}
                >
                  ⚠ {row.lateMarkCount}
                </Badge>
              ) : null}
              <Badge variant="secondary">{stageLabel(row)}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
