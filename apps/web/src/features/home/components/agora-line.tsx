import { m } from '@church/i18n/messages';
import { now, today } from '@church/time';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { useSetupProgress } from '@/features/home/components/church-section';
import { useScheduleInsights } from '@/features/home/components/home-insights';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { usePendingChecks } from '@/features/home/components/my-serving-section';
import { usePeopleCounts } from '@/features/home/components/summary-widgets';
import type { HomeCapacities } from '@/features/home/hooks/use-home-capacities';
import { type Agora, deriveAgora } from '@/features/home/lib/agora';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { pluralMessage } from '@/shared/utils/plural';

interface AgoraLineProps extends HomeSectionProps {
  capacities: HomeCapacities;
}

const actionClass = buttonVariants({ size: 'touch' });

interface AgoraContentInput {
  agora: Exclude<Agora, { kind: 'calm' }>;
}

/** The sentence and its one action for each kind of Agora. */
interface AgoraContent {
  sentence: string;
  action: ReactNode;
}

function agoraContent({ agora }: AgoraContentInput): AgoraContent {
  switch (agora.kind) {
    case 'check-overdue':
    case 'check-pending':
      return {
        sentence: (agora.kind === 'check-overdue'
          ? m.home_agora_check_overdue
          : m.home_agora_check_pending)({
          ministryName: agora.check.ministryName,
          cycleName: agora.check.cycleName,
        }),
        action: (
          <Link
            to="/app/availability/$checkId"
            params={{ checkId: agora.check.id }}
            className={actionClass}
          >
            {m.home_agora_answer()}
          </Link>
        ),
      };
    case 'setup':
      return {
        sentence: m.home_agora_setup(),
        action: (
          <a href="#home-setup" className={actionClass}>
            {m.home_agora_setup_action()}
          </a>
        ),
      };
    case 'coverage-gap':
      return {
        sentence: pluralMessage({
          count: agora.open,
          one: () =>
            m.home_agora_gap_one({
              ministryName: agora.ministryName,
              cycleName: agora.cycleName,
            }),
          other: () =>
            m.home_agora_gap_other({
              ministryName: agora.ministryName,
              cycleName: agora.cycleName,
              count: agora.open,
            }),
        }),
        action: (
          <Link
            to="/app/schedules/$ministryId/$cycleId"
            params={{ ministryId: agora.ministryId, cycleId: agora.cycleId }}
            className={actionClass}
          >
            {m.home_agora_open_schedule()}
          </Link>
        ),
      };
    case 'unanswered':
      return {
        sentence: pluralMessage({
          count: agora.count,
          one: () =>
            m.home_agora_unanswered_one({ cycleName: agora.cycleName }),
          other: () =>
            m.home_agora_unanswered_other({
              cycleName: agora.cycleName,
              count: agora.count,
            }),
        }),
        action: (
          <Link
            to="/app/schedules"
            search={{ stage: 'asking' }}
            className={actionClass}
          >
            {m.home_agora_see_schedules()}
          </Link>
        ),
      };
    case 'people-without-ministry':
      return {
        sentence: pluralMessage({
          count: agora.count,
          one: () => m.home_agora_people_one(),
          other: () => m.home_agora_people_other({ count: agora.count }),
        }),
        action: (
          <Link
            to="/app/people"
            search={{ withoutMinistry: true }}
            className={actionClass}
          >
            {m.home_agora_see_people()}
          </Link>
        ),
      };
  }
}

/**
 * "Agora": one sentence and one action for what needs the caller first,
 * derived from the reads Home's widgets already make (same query keys, so no
 * extra request). A source that failed is left out; its widget shows the error.
 */
export function AgoraLine({ capacities, ...props }: AgoraLineProps) {
  const { churchTimezone } = useTimezone();
  const checks = usePendingChecks({ ...props, enabled: capacities.serving });
  const setup = useSetupProgress({ ...props, enabled: capacities.church });
  const people = usePeopleCounts({ ...props, enabled: capacities.church });
  const insights = useScheduleInsights({
    ...props,
    scope: capacities.leadershipScope,
    enabled: capacities.leadership,
  });
  const sources = [
    capacities.serving && checks.query,
    capacities.church && setup,
    capacities.church && people,
    capacities.leadership && insights,
  ].filter((query) => query !== false);
  if (sources.some((query) => query.isPending))
    return (
      <Pending label={m.home_agora()}>
        <Skeleton className="h-11 w-full" />
      </Pending>
    );
  const focus = insights.data?.focus;
  const agora = deriveAgora({
    churchDay: today({ instant: now(), timeZone: churchTimezone }),
    checks: checks.query.data ? checks.pending : undefined,
    setupDone: setup.data?.hasEverSentCycle,
    focus,
    focusAvailability: insights.data?.cycles.find(
      (cycle) => cycle.cycleId === focus?.cycleId,
    ),
    withoutMinistry: people.data?.counts.withoutMinistry,
  });
  // A serving caller's calm is said once, by the serving block's quiet line or its next assignment.
  if (agora.kind === 'calm' && capacities.serving) return null;
  if (agora.kind === 'calm')
    return (
      <section
        aria-labelledby="home-agora"
        className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1"
      >
        <h2 id="home-agora" className="font-semibold">
          {m.home_agora()}
        </h2>
        <p className="flex items-center gap-2 text-muted-foreground">
          <CircleCheck aria-hidden className="size-4" />
          {m.home_agora_calm()}
        </p>
      </section>
    );
  const { sentence, action } = agoraContent({ agora });
  return (
    <section
      aria-labelledby="home-agora"
      className="radius-surface flex flex-col gap-3 bg-primary/8 p-4 ring-1 ring-primary/15 sm:flex-row sm:items-center sm:gap-4 md:px-5"
    >
      <h2 id="home-agora" className="shrink-0 font-semibold">
        {m.home_agora()}
      </h2>
      <p className="min-w-0 flex-1 text-balance text-lg leading-snug">
        {sentence}
      </p>
      <div className="shrink-0">{action}</div>
    </section>
  );
}
