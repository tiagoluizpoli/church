import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { NextCycleCard } from '@/features/home/components/next-cycle-card';
import { SetupChecklist } from '@/features/home/components/setup-checklist';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { setupApi } from '@/utils/api-instances';

/**
 * Home's Church section for a ChurchAdmin: the setup checklist until the
 * Church has ever sent a Cycle, then the next-Cycle card for good.
 */
export function ChurchSection({ churchId, userId }: HomeSectionProps) {
  const progressKey = homeSectionQueryKey({
    section: 'church',
    churchId,
    userId,
    parts: ['setup-progress'],
  });
  const progressQuery = useQuery({
    queryKey: progressKey,
    queryFn: () => setupApi.getSetupProgress(),
    // Setup happens in other tabs; returning to Home shows it.
    refetchOnWindowFocus: 'always',
  });
  const { data: progress } = progressQuery;

  return (
    <section aria-labelledby="home-section-church" className="space-y-3">
      <h2 id="home-section-church" className="font-semibold text-xl">
        {m.home_section_church()}
      </h2>
      {progressQuery.isError ? (
        <HomeError
          message={m.home_setup_load_error()}
          onRetry={() => progressQuery.refetch()}
        />
      ) : !progress ? (
        <div role="status" aria-label={m.home_setup_loading()}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : progress.hasEverSentCycle ? (
        <NextCycleCard churchId={churchId} userId={userId} />
      ) : (
        <SetupChecklist progress={progress} />
      )}
    </section>
  );
}
