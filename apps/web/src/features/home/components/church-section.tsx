import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type {
  HomeReadProps,
  HomeSectionProps,
} from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { SetupChecklist } from '@/features/home/components/setup-checklist';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { setupApi } from '@/utils/api-instances';

/**
 * Home's Church section for a ChurchAdmin: the setup checklist until the
 * Church has ever sent a Cycle, then the next-Cycle card for good.
 */
export function useSetupProgress({
  churchId,
  userId,
  enabled = true,
}: HomeReadProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['setup-progress'],
    }),
    queryFn: () => setupApi.getSetupProgress(),
    // Setup happens in other tabs; returning to Home shows it.
    refetchOnWindowFocus: 'always',
    enabled,
  });
}

export function ChurchSection(props: HomeSectionProps) {
  const progressQuery = useSetupProgress(props);
  const { data: progress } = progressQuery;
  if (progress?.hasEverSentCycle) return null;

  return (
    <HomeWidget id="home-setup" title={m.home_setup_section()}>
      {progressQuery.isError ? (
        <HomeError
          message={m.home_setup_load_error()}
          onRetry={() => progressQuery.refetch()}
        />
      ) : !progress ? (
        <Pending label={m.home_setup_loading()}>
          <Skeleton className="h-24 w-full" />
        </Pending>
      ) : (
        <SetupChecklist progress={progress} />
      )}
    </HomeWidget>
  );
}
