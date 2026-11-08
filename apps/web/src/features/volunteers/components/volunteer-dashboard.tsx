import { useDashboardRefresh } from '../hooks/use-dashboard-refresh';
import { useVolunteerDashboard } from '../hooks/use-volunteer-dashboard';
import { BackgroundRefreshIndicator } from './background-refresh-indicator';
import { DashboardOfflineBanner } from './dashboard-offline-banner';
import { MinistryScheduleSection } from './ministry-schedule-section';
import { UpcomingAssignmentsSection } from './upcoming-assignments-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type DashboardTabId = 'upcoming-assignments' | 'ministry-schedule';

export interface VolunteerDashboardProps {
  initialSection?: 'assignments' | 'ministry_schedule';
  initialAssignmentId?: string;
  initialMinistryId?: string;
}

export const DASHBOARD_SECTION_OPTIONS = [
  'assignments',
  'ministry_schedule',
] as const;

const DEFAULT_DASHBOARD_TAB_ID: DashboardTabId = 'upcoming-assignments';

interface ResolveInitialTabIdInput {
  initialSection: VolunteerDashboardProps['initialSection'];
}

function resolveInitialTabId({
  initialSection,
}: ResolveInitialTabIdInput): DashboardTabId {
  if (initialSection === 'ministry_schedule') {
    return 'ministry-schedule';
  }

  return DEFAULT_DASHBOARD_TAB_ID;
}

export function VolunteerDashboard({
  initialSection,
  initialAssignmentId,
  initialMinistryId,
}: VolunteerDashboardProps) {
  const dashboard = useVolunteerDashboard({
    initialSection,
    initialAssignmentId,
    initialMinistryId,
  });
  const refresh = useDashboardRefresh({
    onRefresh: dashboard.invalidateVolunteerDashboard,
    visibleData: {
      assignmentGroups: dashboard.assignmentGroups,
      ministrySchedule: dashboard.ministrySchedule?.events ?? [],
    },
  });

  return (
    <div className="space-y-4">
      <BackgroundRefreshIndicator
        visible={refresh.hasBackgroundUpdate}
        onDismiss={refresh.dismissBackgroundUpdate}
      />

      <DashboardOfflineBanner
        isOffline={!refresh.isOnline}
        isUsingCachedData={refresh.isUsingCachedData}
        lastUpdatedAt={dashboard.lastUpdatedAt}
        onRefresh={refresh.refresh}
        refreshState={refresh.refreshState}
      />

      <Tabs
        defaultValue={resolveInitialTabId({ initialSection })}
        className="w-full"
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-fit min-w-full sm:min-w-0">
            <TabsTrigger value="upcoming-assignments">
              Upcoming Assignments
            </TabsTrigger>
            <TabsTrigger value="ministry-schedule">
              Ministry Schedule
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="upcoming-assignments">
          <UpcomingAssignmentsSection
            groups={dashboard.assignmentGroups}
            expandedEventId={dashboard.expandedAssignmentEventId}
            isOnline={refresh.isOnline}
            responseState={
              dashboard.respondToAssignment.isPending ? 'saving' : 'idle'
            }
            cancelState={
              dashboard.cancelAssignment.isPending ? 'saving' : 'idle'
            }
            onToggleEvent={dashboard.handleToggleAssignmentGroup}
            onRespond={dashboard.handleRespondToAssignment}
            onCancel={dashboard.handleCancelAssignment}
          />
        </TabsContent>

        <TabsContent value="ministry-schedule">
          <MinistryScheduleSection
            ministries={dashboard.ministryOptions}
            selectedMinistryId={dashboard.selectedMinistryId}
            canSwitchMinistry={dashboard.ministryOptions.length > 1}
            events={dashboard.ministrySchedule?.events ?? []}
            isLoading={dashboard.ministryScheduleQuery.isLoading}
            onSelectMinistry={dashboard.setSelectedMinistryId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
