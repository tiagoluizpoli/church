import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { classifyPrepareFetchError } from '../participation-prepare.utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { adminApi } from '@/utils/api-instances';

export interface CyclePreparePickerProps {
  cycleId: string;
  /** The Ministries a Cycle-ready Notification named for this recipient. */
  ministryIds: string[];
}

/**
 * N2's multiple-Ministry entry: the named Ministries the caller still leads,
 * each opening its Schedule for the same Cycle. The leader-scoped Ministry
 * list is the authority; the Schedule page checks access again.
 */
export function CyclePreparePicker({
  cycleId,
  ministryIds,
}: CyclePreparePickerProps) {
  const ministriesQuery = useQuery({
    queryKey: ['prepare-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const named = new Set(ministryIds);
  const ministries = (ministriesQuery.data?.ministries ?? []).filter(
    (ministry) => named.has(ministry.id),
  );
  const errorKind = ministriesQuery.isError
    ? classifyPrepareFetchError({ error: ministriesQuery.error })
    : null;

  return (
    <WorkspacePage data-testid="cycle-prepare-picker">
      <WorkspaceIntroPanel
        title={m.prepare_cycle_picker_title()}
        description={m.prepare_cycle_picker_description()}
        autoFocusTitle
      />
      {errorKind === 'forbidden' ? (
        <Alert variant="destructive">
          <AlertDescription>
            {m.prepare_cycle_picker_forbidden()}
          </AlertDescription>
        </Alert>
      ) : errorKind === 'retryable' ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.prepare_cycle_picker_error()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ministriesQuery.refetch()}
            >
              {m.prepare_cycle_picker_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : ministriesQuery.isPending ? (
        <output className="grid gap-3">
          <span className="sr-only">{m.prepare_cycle_picker_loading()}</span>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </output>
      ) : ministries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {m.prepare_cycle_picker_empty()}
        </p>
      ) : (
        <ul className="grid gap-2">
          {ministries.map((ministry) => (
            <li key={ministry.id}>
              <Link
                to="/schedules/$ministryId/$cycleId"
                params={{ ministryId: ministry.id, cycleId }}
                aria-label={m.prepare_cycle_picker_open({
                  ministryName: ministry.name,
                })}
                className={buttonVariants({
                  variant: 'outline',
                  className: 'w-full justify-start',
                })}
              >
                {ministry.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePage>
  );
}
