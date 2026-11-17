import { m } from '@church/i18n/messages';
import {
  compareCalendarDays,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import type { ListCycles200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

interface CycleContentProps {
  cycle: ListCycles200CyclesItem | undefined;
  canPlan?: boolean;
}

function CycleContent({ cycle, canPlan = false }: CycleContentProps) {
  if (!cycle)
    return (
      <div>
        <p>{m.home_next_cycle_none()}</p>
        {canPlan ? (
          <Link
            to="/cycles"
            className="inline-flex min-h-11 items-center underline"
          >
            {m.home_next_cycle_plan()}
          </Link>
        ) : null}
      </div>
    );
  const { id: cycleId, name: cycleName, endDate, state } = cycle;
  return (
    <Link
      to="/cycles/$cycleId"
      params={{ cycleId }}
      className="inline-flex min-h-11 items-center underline"
    >
      {state === 'draft'
        ? m.home_next_cycle_draft({ cycleName })
        : m.home_next_cycle_sent({
            cycleName,
            endDate: formatCalendarDateOnly({ value: endDate }),
          })}
    </Link>
  );
}

export function NextCycleCard({ churchId, userId }: HomeSectionProps) {
  const { churchTimezone } = useTimezone();
  const query = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['cycles'],
    }),
    queryFn: () => adminApi.listCycles(),
    staleTime: 60_000,
  });
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const cycles = query.data?.cycles ?? [];
  const current = cycles.find(
    (cycle) =>
      compareCalendarDays({
        left: parseCalendarDay({ value: cycle.startDate }),
        right: churchDay,
      }) <= 0 &&
      compareCalendarDays({
        left: parseCalendarDay({ value: cycle.endDate }),
        right: churchDay,
      }) >= 0,
  );
  const next = cycles.reduce<ListCycles200CyclesItem | undefined>(
    (nearest, cycle) => {
      if (
        compareCalendarDays({
          left: parseCalendarDay({ value: cycle.startDate }),
          right: churchDay,
        }) <= 0
      )
        return nearest;
      return !nearest || cycle.startDate < nearest.startDate ? cycle : nearest;
    },
    undefined,
  );
  return (
    <HomeWidget
      title={m.home_cycles()}
      loading={query.isPending}
      error={
        query.isError
          ? {
              message: m.home_next_cycle_load_error(),
              retry: () => query.refetch(),
            }
          : undefined
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium">{m.home_current_cycle()}</h3>
          <CycleContent cycle={current} />
        </div>
        <div>
          <h3 className="font-medium">{m.home_next_cycle_title()}</h3>
          <CycleContent cycle={next} canPlan />
        </div>
      </div>
    </HomeWidget>
  );
}
