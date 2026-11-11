import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { ScheduleRows } from '@/features/scheduling/components/prepare/schedule-rows';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

/** A current Schedule that waits on the leader: unanswered, unfilled, or open swap requests. */
function needsAttention(row: ListSchedules200SchedulesItem): boolean {
  if (row.cycle.state === 'past') return false;
  switch (row.stage) {
    case 'to_prepare':
      return true;
    case 'asking':
      return !!row.asking && row.asking.asked > row.asking.confirmed;
    case 'assigning':
      return row.gapCount > 0;
    case 'published':
      return row.openSwapRequestCount > 0;
    case 'not_serving':
      return false;
  }
}

/** Home slot: mounted by `HomePage` only when the `leadership` capacity is held. */
export function LeadershipSection({ churchId, userId }: HomeSectionProps) {
  const query = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'leadership',
      churchId,
      userId,
      parts: ['schedules'],
    }),
    queryFn: () => adminApi.listSchedules(),
    retry: false,
  });
  const attention = (query.data?.schedules ?? []).filter(needsAttention);
  return (
    <section
      aria-labelledby="home-section-leadership"
      data-church-id={churchId}
      data-user-id={userId}
      className="grid gap-3"
    >
      <h2 id="home-section-leadership" className="font-semibold text-xl">
        {m.home_section_leadership()}
      </h2>
      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span>{m.schedules_error()}</span>
            <Button variant="outline" onClick={() => query.refetch()}>
              {m.schedules_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : query.isPending ? (
        <output className="grid gap-2">
          <span className="sr-only">{m.schedules_loading()}</span>
          <Skeleton className="h-16 w-full" />
        </output>
      ) : attention.length === 0 ? (
        <p className="text-muted-foreground">{m.home_leadership_empty()}</p>
      ) : (
        <ScheduleRows schedules={attention} showOutstanding />
      )}
    </section>
  );
}
