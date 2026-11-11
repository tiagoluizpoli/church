import { m } from '@church/i18n/messages';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import { ChurchSection } from '@/features/home/components/church-section';
import { HomeError } from '@/features/home/components/home-error';
import { LeadershipSection } from '@/features/home/components/leadership-section';
import { MyServingSection } from '@/features/home/components/my-serving-section';
import {
  type HomeCapacities,
  useHomeCapacities,
} from '@/features/home/hooks/use-home-capacities';
import {
  type HomeSection,
  homeSectionQueryPrefix,
} from '@/features/home/lib/home-query-keys';
import type { HomeSearch } from '@/features/home/lib/home-search';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { churchOnlyWarningMessage } from '@/shared/utils/church-only-warning';
import { membershipRemovedMessage } from '@/shared/utils/membership-removal';
import { ministryJoinedMessage } from '@/shared/utils/ministry-invitation-result';
import { activeChurchApi } from '@/utils/api-instances';

interface HomePageProps {
  search: HomeSearch;
}

interface HomeBannersProps {
  search: HomeSearch;
}

function HomeBanners({ search }: HomeBannersProps) {
  const banners: string[] = [];
  if (search.accessDenied) banners.push(m.switch_church_access_denied());
  if (search.removedFrom) {
    banners.push(membershipRemovedMessage({ churchName: search.removedFrom }));
  }
  if (search.joinedChurch && search.invitedMinistry) {
    banners.push(
      churchOnlyWarningMessage({
        churchName: search.joinedChurch,
        ministryName: search.invitedMinistry,
      }),
    );
  }
  if (banners.length === 0) return null;
  return (
    <div className="space-y-2">
      {banners.map((banner) => (
        <Alert key={banner}>
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

interface PlainWelcomeProps {
  churchId: string;
}

function PlainWelcome({ churchId }: PlainWelcomeProps) {
  const optionsQuery = useQuery({
    queryKey: ['active-church', 'options'],
    queryFn: () => activeChurchApi.listActiveChurchOptions(),
  });
  const churchName = optionsQuery.data?.churches.find(
    (church) => church.churchId === churchId,
  )?.name;
  if (churchName) {
    return <p className="text-lg">{m.home_welcome({ churchName })}</p>;
  }
  if (optionsQuery.isPending) return <Skeleton className="h-6 w-72" />;
  return (
    <HomeError
      message={m.home_load_error()}
      onRetry={() => optionsQuery.refetch()}
    />
  );
}

/** Drop cached privileged reads of every section whose capacity is not held. */
function useClearUnheldSections(capacities: HomeCapacities | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!capacities) return;
    const sections: HomeSection[] = ['church', 'leadership', 'serving'];
    for (const section of sections) {
      if (!capacities[section]) {
        queryClient.removeQueries({
          queryKey: homeSectionQueryPrefix({ section }),
        });
      }
    }
  }, [capacities, queryClient]);
}

/** Drop leadership reads cached under a broader (or any other) authority scope. */
function useClearStaleLeadershipScope(capacities: HomeCapacities | null) {
  const queryClient = useQueryClient();
  const leadershipScope = capacities?.leadershipScope;
  useEffect(() => {
    if (!leadershipScope) return;
    queryClient.removeQueries({
      queryKey: homeSectionQueryPrefix({ section: 'leadership' }),
      predicate: ({ queryKey }) => queryKey.at(-1) !== leadershipScope,
    });
  }, [leadershipScope, queryClient]);
}

/**
 * Home (`/`): the common entry. Sections mount by additive capacity in the
 * order Church → Ministries I lead → My serving; a plain Church Member sees a
 * neutral welcome only after the capability read succeeded.
 */
export function HomePage({ search }: HomePageProps) {
  const scope = useCallerCapabilitiesScope();
  const state = useHomeCapacities();
  const capacities = state.status === 'ready' ? state.capacities : null;
  useClearUnheldSections(capacities);
  useClearStaleLeadershipScope(capacities);

  useEffect(() => {
    if (search.joinedMinistry) {
      toast.success(
        ministryJoinedMessage({ ministryName: search.joinedMinistry }),
      );
    }
  }, [search.joinedMinistry]);

  useEffect(() => {
    if (search.invitationDeclined) {
      toast.success(m.ministry_invitation_declined_toast());
    }
  }, [search.invitationDeclined]);

  const sectionProps = scope?.userId
    ? { churchId: scope.churchId, userId: scope.userId }
    : null;

  return (
    <WorkspacePage>
      <h1 className="sr-only">{m.nav_home()}</h1>
      <HomeBanners search={search} />
      {state.status === 'error' ? (
        <HomeError message={m.home_load_error()} onRetry={state.retry} />
      ) : !capacities || !sectionProps ? (
        <div role="status" aria-label={m.home_loading()}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !capacities.leadership && !capacities.serving ? (
        <PlainWelcome churchId={sectionProps.churchId} />
      ) : (
        <>
          {capacities.church ? <ChurchSection {...sectionProps} /> : null}
          {capacities.leadership ? (
            <LeadershipSection
              {...sectionProps}
              scope={capacities.leadershipScope}
            />
          ) : null}
          {capacities.serving ? <MyServingSection {...sectionProps} /> : null}
        </>
      )}
    </WorkspacePage>
  );
}
