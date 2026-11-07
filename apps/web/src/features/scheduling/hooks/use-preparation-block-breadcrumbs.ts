import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

export interface PreparationBreadcrumbOverride {
  segment: string;
  label: string | null;
}

/** Direct-id preparation uses only the caller-scoped Schedule and prepare reads. */
export function usePreparationBlockBreadcrumbs(): PreparationBreadcrumbOverride[] {
  const { ministryId, cycleId, timeSlotId } = useParams({ strict: false });
  const { churchTimezone } = useTimezone();
  const enabled =
    ministryId !== undefined &&
    cycleId !== undefined &&
    timeSlotId !== undefined;
  const schedules = useQuery({
    queryKey: ['prepare-schedules'],
    queryFn: () => adminApi.listSchedules(),
    enabled,
    retry: false,
  });
  const participation = useQuery({
    queryKey: ['prepare-cycle-participation', ministryId, cycleId],
    queryFn: () =>
      adminApi.getCycleParticipation(cycleId ?? '', {
        ministryId: ministryId ?? '',
      }),
    enabled,
    retry: false,
  });
  if (!enabled || schedules.isError || participation.isError) return [];
  const schedule = schedules.data?.schedules.find(
    (row) => row.ministry.id === ministryId && row.cycle.id === cycleId,
  );
  const block = participation.data?.events
    .flatMap((event) => event.eventTimeBlocks)
    .find((candidate) => candidate.eventTimeBlock.id === timeSlotId);
  if (!schedule || !block) return [];
  const { startTime, endTime } = block.eventTimeBlock;
  const label = formatInstantRangeOf({
    start: startTime,
    end: endTime,
    timeZone: churchTimezone,
  });
  return [
    { segment: ministryId, label: schedule.ministry.name },
    { segment: cycleId, label: schedule.cycle.name },
    { segment: 'slots', label: null },
    { segment: timeSlotId, label },
  ];
}
