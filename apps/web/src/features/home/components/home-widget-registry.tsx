import type { ComponentType } from 'react';
import { ChurchSection } from '@/features/home/components/church-section';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { LeadershipSection } from '@/features/home/components/leadership-section';
import {
  NextAssignmentWidget,
  PendingChecksWidget,
  UpcomingAssignmentsWidget,
} from '@/features/home/components/my-serving-section';
import { NextCycleCard } from '@/features/home/components/next-cycle-card';
import {
  AdminSummary,
  NotificationSummary,
  ScheduleSummary,
} from '@/features/home/components/summary-widgets';
import type { HomeCapacities } from '@/features/home/hooks/use-home-capacities';

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

interface WidgetDefinition {
  id: string;
  capacity: (caps: HomeCapacities) => boolean;
  span: WidgetSpan;
  Component: ComponentType<WidgetProps>;
  cacheSection?: string;
  universal?: boolean;
  /** Extra wrapper classes, e.g. to widen a paired widget when its partner renders nothing. */
  className?: string;
}

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
    id: 'next-assignment',
    capacity: (caps) => caps.serving,
    span: 6,
    Component: NextAssignmentWidget,
    cacheSection: 'serving',
    // Full width when the pending-checks widget beside it renders nothing.
    className: 'md:[&:has(+div:empty)]:col-span-12',
  },
  {
    id: 'pending-checks',
    capacity: (caps) => caps.serving,
    span: 6,
    Component: PendingChecksWidget,
    cacheSection: 'serving',
    // Full width when there is no next-assignment widget beside it.
    className: 'md:[div:empty+&]:col-span-12',
  },
  {
    id: 'upcoming-assignments',
    capacity: (caps) => caps.serving,
    span: 12,
    Component: UpcomingAssignmentsWidget,
    cacheSection: 'serving',
  },
  {
    id: 'schedule-summary',
    capacity: (caps) => caps.leadership,
    span: 12,
    Component: ScheduleSummary,
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
    id: 'cycles',
    capacity: (caps) => caps.church,
    span: 12,
    Component: NextCycleCard,
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
