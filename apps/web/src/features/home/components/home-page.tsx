import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatLongCalendarDay, now, today } from '@church/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import { AgoraLine } from '@/features/home/components/agora-line';
import { HomeError } from '@/features/home/components/home-error';
import {
  homeWidgets,
  widgetSpanClass,
} from '@/features/home/components/home-widget-registry';
import {
  type HomeCapacities,
  useHomeCapacities,
} from '@/features/home/hooks/use-home-capacities';
import {
  type HomeSection,
  homeSectionQueryPrefix,
} from '@/features/home/lib/home-query-keys';
import type { HomeSearch } from '@/features/home/lib/home-search';
import { cn } from '@/lib/utils';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
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
    staleTime: 60_000,
  });
  const churchName = optionsQuery.data?.churches.find(
    (church) => church.churchId === churchId,
  )?.name;
  if (churchName) {
    return <p className="text-lg">{m.home_welcome({ churchName })}</p>;
  }
  if (optionsQuery.isPending)
    return (
      <Pending label={m.shell_church_loading()}>
        <Skeleton className="h-6 w-72" />
      </Pending>
    );
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
    const sections = new Set(
      homeWidgets
        .map((widget) => widget.cacheSection)
        .filter((section): section is HomeSection => Boolean(section)),
    );
    for (const section of sections) {
      if (
        !homeWidgets.some(
          (widget) =>
            widget.cacheSection === section && widget.capacity(capacities),
        )
      ) {
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
 * Home (`/app`): the common entry. The Agora line comes first, then sections
 * mount by additive capacity in registry order (attention before statistics);
 * a plain Church Member sees a neutral welcome only after the capability read
 * succeeded.
 */
export function HomePage({ search }: HomePageProps) {
  const scope = useCallerCapabilitiesScope();
  const { churchTimezone } = useTimezone();
  const options = useQuery({
    queryKey: ['active-church', 'options'],
    queryFn: () => activeChurchApi.listActiveChurchOptions(),
    staleTime: 60_000,
  });
  const churchName = options.data?.churches.find(
    (church) => church.churchId === scope?.churchId,
  )?.name;
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
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
    ? {
        churchId: scope.churchId,
        userId: scope.userId,
        scope: capacities?.leadershipScope ?? '',
      }
    : null;

  const holdsSection = capacities
    ? homeWidgets.some(
        (widget) => !widget.universal && widget.capacity(capacities),
      )
    : false;

  return (
    <WorkspacePage>
      <header>
        <h1 className="font-semibold text-3xl">{churchName ?? m.nav_home()}</h1>
        <p className="text-muted-foreground">
          {formatLongCalendarDay({ day: churchDay, locale: getLocale() })}
        </p>
      </header>
      <HomeBanners search={search} />
      {state.status === 'error' ? (
        <HomeError message={m.home_load_error()} onRetry={state.retry} />
      ) : !capacities || !sectionProps ? (
        <Pending label={m.home_loading()}>
          <Skeleton className="h-24 w-full" />
        </Pending>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="empty:hidden md:col-span-12">
            {holdsSection ? (
              <AgoraLine {...sectionProps} capacities={capacities} />
            ) : (
              <PlainWelcome churchId={sectionProps.churchId} />
            )}
          </div>
          {homeWidgets
            .filter((widget) => widget.capacity(capacities))
            .map(({ id, span, Component }) => (
              <div
                key={id}
                className={cn(widgetSpanClass[span], 'empty:hidden')}
              >
                <Component {...sectionProps} capacities={capacities} />
              </div>
            ))}
        </div>
      )}
    </WorkspacePage>
  );
}
