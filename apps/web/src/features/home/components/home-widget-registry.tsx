import type { ComponentType } from 'react';
import { ChurchSection } from '@/features/home/components/church-section';
import { CycleBand } from '@/features/home/components/cycle-band';
import {
  CoverageWidget,
  TrendWidget,
} from '@/features/home/components/home-insights';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { LeadershipSection } from '@/features/home/components/leadership-section';
import {
  ServingActionsWidget,
  ServingHistoryWidget,
} from '@/features/home/components/my-serving-section';
import {
  AdminSummary,
  NotificationSummary,
} from '@/features/home/components/summary-widgets';
import type { HomeCapacities } from '@/features/home/hooks/use-home-capacities';
import type { HomeSection } from '@/features/home/lib/home-query-keys';

interface WidgetProps extends HomeSectionProps {
  scope: string;
  capacities: HomeCapacities;
}
export type WidgetSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const widgetSpanClass: Record<WidgetSpan, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

interface WidgetBase {
  id: string;
  capacity: (caps: HomeCapacities) => boolean;
  span: WidgetSpan;
  Component: ComponentType<WidgetProps>;
}

/** A capacity-gated widget names the section its reads are cached under, so losing the capacity clears them. */
type WidgetDefinition = WidgetBase &
  (
    | { cacheSection: HomeSection; universal?: never }
    | { universal: true; cacheSection?: never }
  );

/** To add a widget: write a component on `HomeWidget` that queries via `homeSectionQueryKey`, then add one entry here (rendered in order). */
export const homeWidgets: WidgetDefinition[] = [
  // A slim unread line first, right under the page header; the shell bell carries the same count.
  {
    id: 'notifications',
    capacity: () => true,
    span: 12,
    Component: NotificationSummary,
    universal: true,
  },
  {
    id: 'serving-actions',
    capacity: (caps) => caps.serving,
    span: 12,
    Component: ServingActionsWidget,
    cacheSection: 'serving',
  },
  // What needs the leader comes before the statistics, on every screen size.
  {
    id: 'leadership',
    capacity: (caps) => caps.leadership,
    span: 12,
    Component: LeadershipSection,
    cacheSection: 'leadership',
  },
  {
    id: 'cycle-band',
    capacity: (caps) => caps.leadership,
    span: 12,
    Component: ({ capacities, ...props }) => (
      <CycleBand {...props} showCycles={capacities.church} />
    ),
    cacheSection: 'leadership',
  },
  {
    id: 'coverage',
    capacity: (caps) => caps.leadership,
    span: 7,
    Component: CoverageWidget,
    cacheSection: 'leadership',
  },
  {
    id: 'trend',
    capacity: (caps) => caps.leadership,
    span: 5,
    Component: TrendWidget,
    cacheSection: 'leadership',
  },
  {
    id: 'serving-history',
    capacity: (caps) => caps.serving,
    span: 12,
    Component: ServingHistoryWidget,
    cacheSection: 'serving',
  },
  {
    id: 'admin-summary',
    capacity: (caps) => caps.church,
    span: 12,
    Component: AdminSummary,
    cacheSection: 'church',
  },
  {
    id: 'setup',
    capacity: (caps) => caps.church,
    span: 12,
    Component: ChurchSection,
    cacheSection: 'church',
  },
];
