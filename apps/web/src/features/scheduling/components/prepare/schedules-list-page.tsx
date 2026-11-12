import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { ScheduleRows } from '@/features/scheduling/components/prepare/schedule-rows';
import type { ListSchedules200SchedulesItemStage } from '@/infrastructure/api/churchAPI.schemas';
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
          <ScheduleRows schedules={current} explicitAction />
          {past.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="ghost" />}>
                {m.schedules_past()}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScheduleRows schedules={past} explicitAction />
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
