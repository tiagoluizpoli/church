import { m } from '@church/i18n/messages';
import {
  compareCalendarDays,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import type { ListCycles200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

interface NextCycleContentProps {
  cycle: ListCycles200CyclesItem | undefined;
}

function NextCycleContent({ cycle }: NextCycleContentProps) {
  if (!cycle) {
    return (
      <>
        <p>{m.home_next_cycle_none()}</p>
        <Link to="/cycles" className={buttonVariants({ size: 'sm' })}>
          {m.home_next_cycle_plan()}
        </Link>
      </>
    );
  }
  const { id: cycleId, name: cycleName, endDate, state } = cycle;
  if (state === 'draft') {
    return (
      <>
        <p>{m.home_next_cycle_draft({ cycleName })}</p>
        <Link
          to="/cycles/$cycleId"
          params={{ cycleId }}
          className={buttonVariants({ size: 'sm' })}
        >
          {m.home_next_cycle_continue()}
        </Link>
      </>
    );
  }
  const formattedEnd = formatCalendarDateOnly({ value: endDate });
  return <p>{m.home_next_cycle_sent({ cycleName, endDate: formattedEnd })}</p>;
}

/** Shown once the Church has ever sent a Cycle: the latest Cycle still to come. */
export function NextCycleCard({ churchId, userId }: HomeSectionProps) {
  const { churchTimezone } = useTimezone();
  const cyclesQuery = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['cycles'],
    }),
    queryFn: () => adminApi.listCycles(),
    refetchOnWindowFocus: 'always',
  });
  const { data } = cyclesQuery;

  if (cyclesQuery.isError) {
    return (
      <HomeError
        message={m.home_next_cycle_load_error()}
        onRetry={() => cyclesQuery.refetch()}
      />
    );
  }
  if (!data) {
    return (
      <div role="status" aria-label={m.home_next_cycle_loading()}>
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const churchToday = today({ instant: now(), timeZone: churchTimezone });
  // The read is ordered start day desc, end day desc, id asc, so the first
  // row still to come is the latest one: a newer draft wins over a current Sent Cycle.
  const next = data.cycles.find(
    ({ state, endDate }) =>
      state !== 'past' &&
      compareCalendarDays({
        left: parseCalendarDay({ value: endDate }),
        right: churchToday,
      }) >= 0,
  );

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="font-medium">{m.home_next_cycle_title()}</h3>
      <NextCycleContent cycle={next} />
    </div>
  );
}
