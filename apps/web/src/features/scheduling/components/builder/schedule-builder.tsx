import { Skeleton } from '@church/ui/components/skeleton';
import { useEffect, useState } from 'react';
import { useScheduleBuilder } from '../../hooks/use-schedule-builder';
import { MobileInterstitial } from './mobile-interstitial';
import { ScheduleBuilderReady } from './schedule-builder-ready';

interface ScheduleBuilderProps {
  eventId: string;
}

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('builder-mobile-override') === 'true') return false;
  return window.innerWidth < 1024 || navigator.maxTouchPoints > 0;
}

export function ScheduleBuilder({ eventId }: ScheduleBuilderProps) {
  const {
    query,
    data,
    refetch,
    invalidate,
    createAssignment,
    deleteAssignment,
    publishEvent,
    eventFillRatio,
    hasHardViolations,
    callerTeamId,
  } = useScheduleBuilder(eventId);

  const [showMobile, setShowMobile] = useState(false);

  useEffect(() => {
    setShowMobile(isMobile());
  }, []);

  if (showMobile) {
    return <MobileInterstitial onContinue={() => setShowMobile(false)} />;
  }

  if (query.isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded border border-destructive p-4 text-destructive text-sm">
        {query.error?.message ?? 'Failed to load builder'}
      </div>
    );
  }

  return (
    <ScheduleBuilderReady
      builderData={data}
      callerTeamId={callerTeamId}
      eventFillRatio={eventFillRatio}
      eventId={eventId}
      hasHardViolations={hasHardViolations}
      invalidate={invalidate}
      refetch={refetch}
      createAssignment={createAssignment}
      deleteAssignment={deleteAssignment}
      publishEvent={publishEvent}
    />
  );
}
