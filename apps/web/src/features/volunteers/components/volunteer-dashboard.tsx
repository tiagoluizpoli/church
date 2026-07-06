import { Badge } from '@church/ui/components/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@church/ui/components/tabs';
import { Link } from '@tanstack/react-router';
import { useDashboardRefresh } from '../hooks/use-dashboard-refresh';
import { useVolunteerDashboard } from '../hooks/use-volunteer-dashboard';
import {
  mapAvailabilityEvent,
  mapAvailabilityTask,
} from '../lib/dashboard-mappers';
import { AvailabilityForm } from './availability-form';
import { AvailabilityNeededSection } from './availability-needed-section';
import { BackgroundRefreshIndicator } from './background-refresh-indicator';
import { DashboardOfflineBanner } from './dashboard-offline-banner';
import { MinistryScheduleSection } from './ministry-schedule-section';
import { UpcomingAssignmentsSection } from './upcoming-assignments-section';

export type DashboardTabId =
  | 'upcoming-assignments'
  | 'availability-needed'
  | 'ministry-schedule';

export interface VolunteerDashboardProps {
  volunteerName?: string;
  initialSection?: 'availability' | 'assignments' | 'ministry_schedule';
  initialEventId?: string;
  initialAssignmentId?: string;
  initialMinistryId?: string;
}

export const DASHBOARD_SECTION_OPTIONS = [
  'availability',
  'assignments',
  'ministry_schedule',
] as const;

const DEFAULT_DASHBOARD_TAB_ID: DashboardTabId = 'upcoming-assignments';

function resolveInitialTabId({
  initialSection,
}: {
  initialSection: VolunteerDashboardProps['initialSection'];
}): DashboardTabId {
  if (initialSection === 'availability') {
    return 'availability-needed';
  }

  if (initialSection === 'ministry_schedule') {
    return 'ministry-schedule';
  }

  return DEFAULT_DASHBOARD_TAB_ID;
}

export function VolunteerDashboard({
  volunteerName,
  initialSection,
  initialEventId,
  initialAssignmentId,
  initialMinistryId,
}: VolunteerDashboardProps) {
  const dashboard = useVolunteerDashboard({
    initialSection,
    initialEventId,
    initialAssignmentId,
    initialMinistryId,
  });
  const refresh = useDashboardRefresh({
    onRefresh: dashboard.invalidateVolunteerDashboard,
    visibleData: {
      assignmentGroups: dashboard.assignmentGroups,
      availabilityTasks: dashboard.availabilityTasks,
      ministrySchedule: dashboard.ministrySchedule?.events ?? [],
    },
  });

  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Volunteer Dashboard</CardTitle>
          <CardDescription>
            {volunteerName
              ? `Review what needs your attention, ${volunteerName}.`
              : 'Review what needs your attention.'}
          </CardDescription>
          <Link
            to="/volunteer/availability"
            className="text-primary text-sm hover:underline"
          >
            View availability checks
          </Link>
        </CardHeader>
      </Card>

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
        <TabsList>
          <TabsTrigger value="upcoming-assignments">
            Upcoming Assignments
          </TabsTrigger>
          <TabsTrigger value="availability-needed">
            Availability Needed
            {dashboard.availabilityTasks.length > 0 ? (
              <Badge variant="secondary">
                {dashboard.availabilityTasks.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="ministry-schedule">Ministry Schedule</TabsTrigger>
        </TabsList>

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

        <TabsContent value="availability-needed">
          <AvailabilityNeededSection
            tasks={dashboard.availabilityTasks.map(mapAvailabilityTask)}
            onOpenEvent={dashboard.setSelectedEventId}
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

      <Dialog
        open={dashboard.selectedTask != null}
        onOpenChange={(open) => {
          if (!open) {
            dashboard.setSelectedEventId(undefined);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Availability editor</DialogTitle>
            <DialogDescription>
              Save your event-specific availability before the event begins.
            </DialogDescription>
          </DialogHeader>
          {dashboard.selectedTask ? (
            <AvailabilityForm
              event={mapAvailabilityEvent(dashboard.selectedTask)}
              slots={dashboard.availabilitySlots}
              isEditable={true}
              isOnline={refresh.isOnline}
              onSave={dashboard.handleSaveAvailability}
              saveState={
                dashboard.saveAvailability.isPending
                  ? 'saving'
                  : dashboard.saveAvailability.isSuccess
                    ? 'saved'
                    : dashboard.saveAvailability.isError
                      ? 'error'
                      : 'idle'
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
