import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { ScheduleRows } from '@/features/scheduling/components/prepare/schedule-rows';
import { adminApi } from '@/utils/api-instances';

interface LeadershipSectionProps extends HomeSectionProps {
  scope: string;
}
const LEADERSHIP_PAGE_SIZE = 5;
export function useHomeSchedules({
  churchId,
  userId,
  scope,
}: LeadershipSectionProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'leadership',
      churchId,
      userId,
      parts: ['schedules', scope],
    }),
    queryFn: () =>
      adminApi.listSchedules({
        attention: 'true',
        limit: LEADERSHIP_PAGE_SIZE,
      }),
  });
}
export function LeadershipSection(props: LeadershipSectionProps) {
  const query = useHomeSchedules(props);
  const schedules = query.data?.schedules ?? [];
  return (
    <HomeWidget
      title={m.home_attention_schedules()}
      loading={query.isPending}
      error={
        query.isError
          ? { message: m.schedules_error(), retry: () => query.refetch() }
          : undefined
      }
      action={
        schedules.length > 0 ? (
          <Link
            to="/app/schedules"
            search={{ attention: true }}
            className="inline-flex min-h-11 items-center underline"
          >
            {m.home_see_all()}
          </Link>
        ) : undefined
      }
    >
      {schedules.length ? (
        <ScheduleRows schedules={schedules} showOutstanding />
      ) : (
        <p className="text-muted-foreground">{m.home_leadership_empty()}</p>
      )}
    </HomeWidget>
  );
}
