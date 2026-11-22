import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { ChevronLeft } from 'lucide-react';
import { useId } from 'react';
import { AvailabilityAnswerBar } from './availability-detail/availability-answer-bar';
import { AvailabilityAnswerPanel } from './availability-detail/availability-answer-panel';
import { AvailabilityDayList } from './availability-detail/availability-day-list';
import { AvailabilityDetailHeader } from './availability-detail/availability-detail-header';
import { AvailabilityLeaveDialog } from './availability-detail/availability-leave-dialog';
import { LINK_CLASS } from './availability-detail/style';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import {
  type UseAvailabilityAnswerInput,
  useAvailabilityAnswer,
} from '@/features/volunteers/hooks/use-availability-answer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { volunteerApi } from '@/utils/api-instances';

export interface AvailabilityDetailPageProps {
  checkId: string;
  onAnswered: () => void | Promise<void>;
}

interface AvailabilityAnswerViewProps extends UseAvailabilityAnswerInput {
  /** From lg up the answer sits in a side panel beside the days; below it, a bottom bar. */
  wide: boolean;
}

function AvailabilityAnswerView({
  wide,
  ...input
}: AvailabilityAnswerViewProps) {
  const idPrefix = useId();
  const answer = useAvailabilityAnswer(input);
  const panel = answer.canEdit && wide;
  return (
    // Room for the fixed mobile bar, which keeps one height from the first render.
    <WorkspacePage className={cn(answer.canEdit && 'pb-36 md:pb-0')}>
      <Link
        to="/app/availability"
        className="-my-2 inline-flex min-h-11 items-center gap-1 self-start font-medium text-primary text-sm md:hidden"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {m.availability_detail_back()}
      </Link>
      <AvailabilityDetailHeader answer={answer} />
      {answer.restored ? (
        <div
          role="status"
          className="surface-subtle flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
        >
          <p>{m.availability_draft_restored()}</p>
          <Button
            disabled={answer.pending}
            variant="outline"
            onClick={answer.discardRestored}
          >
            {m.availability_draft_discard()}
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          panel && 'grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4',
        )}
      >
        <div className="surface-panel">
          <div className="workspace-panel-lg">
            <AvailabilityDayList answer={answer} idPrefix={idPrefix} />
          </div>
          {answer.canEdit && !wide ? (
            <AvailabilityAnswerBar answer={answer} idPrefix={idPrefix} />
          ) : null}
        </div>
        {panel ? (
          <AvailabilityAnswerPanel answer={answer} idPrefix={idPrefix} />
        ) : null}
      </div>
      <AvailabilityLeaveDialog answer={answer} />
    </WorkspacePage>
  );
}

function AvailabilityDetailContent({
  checkId,
  onAnswered,
}: AvailabilityDetailPageProps) {
  const scope = useCallerCapabilitiesScope();
  const touch = useMediaQuery('(max-width: 767px)');
  const wide = useMediaQuery('(min-width: 1024px)') && !touch;
  const query = useQuery({
    queryKey: ['availability-check', checkId],
    queryFn: () => volunteerApi.getAvailabilityCheck(checkId),
  });
  if (query.isLoading)
    return (
      <Pending label={m.availability_detail_loading()}>
        <Skeleton className="h-64 w-full" />
      </Pending>
    );
  if (query.isError) {
    const status = isAxiosError(query.error)
      ? query.error.response?.status
      : undefined;
    if (status === 404 || status === 403)
      return (
        <div className="space-y-2">
          {status === 404 ? (
            <p role="alert">{m.error_not_found()}</p>
          ) : (
            <p role="status">{m.shell_not_serving()}</p>
          )}
          <Link
            to="/app/availability"
            className={cn(
              'inline-flex min-h-11 items-center gap-1 md:min-h-8',
              LINK_CLASS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            {m.availability_detail_back()}
          </Link>
        </div>
      );
    return (
      <div role="alert" className="space-y-3 text-destructive">
        <p>{m.availability_detail_load_error()}</p>
        <Button variant="outline" size="touch" onClick={() => query.refetch()}>
          {m.schedules_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data || !scope?.userId) return null;
  return (
    // Mobile answers with 44px targets; desktop at the 32px density (DESIGN.md Density).
    <FormControlSizeProvider size={touch ? 'touch' : 'default'}>
      <AvailabilityAnswerView
        key={`${scope.userId}:${checkId}`}
        userId={scope.userId}
        check={query.data}
        wide={wide}
        hasFreshDetail={query.isFetchedAfterMount}
        onAnswered={onAnswered}
      />
    </FormControlSizeProvider>
  );
}

export function AvailabilityDetailPage(props: AvailabilityDetailPageProps) {
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityDetailContent {...props} />
    </CapabilityGate>
  );
}
