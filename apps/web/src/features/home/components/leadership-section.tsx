import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { ScheduleRows } from '@/features/scheduling/components/prepare/schedule-rows';
import { adminApi } from '@/utils/api-instances';

/** Home shows one short page; the rest is on the Schedules page. */
const LEADERSHIP_PAGE_SIZE = 5;

interface LeadershipSectionProps extends HomeSectionProps {
  /** The caller's leadership authority; cached rows are keyed by it so a narrower scope never reads a broader one. */
  scope: string;
}

/** Home slot: mounted by `HomePage` only when the `leadership` capacity is held. */
export function LeadershipSection({
  churchId,
  userId,
  scope,
}: LeadershipSectionProps) {
  const queryKey = homeSectionQueryKey({
    section: 'leadership',
    churchId,
    userId,
    parts: ['schedules', scope],
  });
  const query = useQuery({
    queryKey,
    queryFn: () =>
      adminApi.listSchedules({
        attention: 'true',
        limit: LEADERSHIP_PAGE_SIZE,
      }),
    retry: false,
  });
  const schedules = query.data?.schedules ?? [];
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
        <HomeError
          message={m.schedules_error()}
          onRetry={() => query.refetch()}
        />
      ) : query.isPending ? (
        <output className="grid gap-2">
          <span className="sr-only">{m.schedules_loading()}</span>
          <Skeleton className="h-16 w-full" />
        </output>
      ) : schedules.length === 0 ? (
        <p className="text-muted-foreground">{m.home_leadership_empty()}</p>
      ) : (
        <>
          <ScheduleRows schedules={schedules} showOutstanding />
          {query.data?.nextCursor && (
            <Link
              to="/schedules"
              search={{ attention: true }}
              className="inline-block min-h-11 py-2 underline"
            >
              {m.home_leadership_see_all()}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
