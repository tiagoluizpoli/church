import type { ComponentType } from 'react';
import { ChurchSection } from '@/features/home/components/church-section';
import {
  CoverageWidget,
  TrendWidget,
} from '@/features/home/components/home-insights';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { LeadershipSection } from '@/features/home/components/leadership-section';
import { ServingActionsWidget } from '@/features/home/components/my-serving-section';
import { NextCycleCard } from '@/features/home/components/next-cycle-card';
import {
  AdminSummary,
  NotificationSummary,
  ScheduleSummary,
} from '@/features/home/components/summary-widgets';
import type { HomeCapacities } from '@/features/home/hooks/use-home-capacities';
import type { HomeSection } from '@/features/home/lib/home-query-keys';

interface WidgetProps extends HomeSectionProps {
  scope: string;
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
  /** A function when the widget shares its row only with a widget the same viewer may lack. */
  span: WidgetSpan | ((caps: HomeCapacities) => WidgetSpan);
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
  {
    id: 'schedule-summary',
    capacity: (caps) => caps.leadership,
    span: (caps) => (caps.church ? 7 : 12),
    Component: ScheduleSummary,
    cacheSection: 'leadership',
  },
  {
    id: 'cycles',
    capacity: (caps) => caps.church,
    span: (caps) => (caps.leadership ? 5 : 12),
    Component: NextCycleCard,
    cacheSection: 'church',
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
  {
    id: 'leadership',
    capacity: (caps) => caps.leadership,
    span: 12,
    Component: LeadershipSection,
    cacheSection: 'leadership',
  },
];
