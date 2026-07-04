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
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useDashboardRefresh } from '../hooks/use-dashboard-refresh';
import { useNotificationInbox } from '../hooks/use-notification-inbox';
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
import { NotificationDetailSheet } from './notification-detail-sheet';
import { NotificationsInboxSection } from './notifications-inbox-section';
import { UpcomingAssignmentsSection } from './upcoming-assignments-section';

export interface VolunteerDashboardProps {
  volunteerName?: string;
  initialSection?:
    | 'availability'
    | 'assignments'
    | 'notifications'
    | 'ministry_schedule';
  initialEventId?: string;
  initialAssignmentId?: string;
  initialMinistryId?: string;
}

export const DASHBOARD_SECTION_OPTIONS = [
  'availability',
  'assignments',
  'notifications',
  'ministry_schedule',
] as const;

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
  const inbox = useNotificationInbox(dashboard.notificationUnreadCount);
  const refresh = useDashboardRefresh({
    onRefresh: async () => {
      await Promise.all([
        dashboard.invalidateVolunteerDashboard(),
        inbox.refresh(),
      ]);
    },
    visibleData: {
      assignmentGroups: dashboard.assignmentGroups,
      availabilityTasks: dashboard.availabilityTasks,
      ministrySchedule: dashboard.ministrySchedule?.events ?? [],
      notificationPages: inbox.pages,
    },
  });

  const handleOpenNotificationContext = () => {
    const notification = inbox.selectedNotification;
    if (!notification) {
      return;
    }

    if (notification.deepLink.section === 'availability') {
      if (
        notification.deepLink.eventId &&
        dashboard.availabilityTasks.some(
          (task) => task.eventId === notification.deepLink.eventId,
        )
      ) {
        dashboard.setSelectedEventId(notification.deepLink.eventId);
        inbox.setSelectedNotificationId(undefined);
        return;
      }
    }

    if (notification.deepLink.section === 'assignments') {
      const matchingGroup = dashboard.assignmentGroups.find(
        (group) =>
          group.eventId === notification.deepLink.eventId ||
          group.assignments.some(
            (assignment) =>
              assignment.assignmentId === notification.deepLink.assignmentId,
          ),
      );

      if (matchingGroup) {
        dashboard.openAssignmentGroup(matchingGroup.eventId);
        inbox.setSelectedNotificationId(undefined);
        return;
      }
    }

    if (notification.deepLink.section === 'ministry_schedule') {
      if (notification.deepLink.ministryId) {
        dashboard.setSelectedMinistryId(notification.deepLink.ministryId);
      }
      inbox.setSelectedNotificationId(undefined);
      return;
    }

    toast.info(
      'Original target changed. Showing latest dashboard context instead.',
    );
    inbox.setSelectedNotificationId(undefined);
  };

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

      <AvailabilityNeededSection
        tasks={dashboard.availabilityTasks.map(mapAvailabilityTask)}
        onOpenEvent={dashboard.setSelectedEventId}
      />

      <UpcomingAssignmentsSection
        groups={dashboard.assignmentGroups}
        expandedEventId={dashboard.expandedAssignmentEventId}
        isOnline={refresh.isOnline}
        responseState={
          dashboard.respondToAssignment.isPending ? 'saving' : 'idle'
        }
        onToggleEvent={dashboard.handleToggleAssignmentGroup}
        onRespond={dashboard.handleRespondToAssignment}
      />

      <NotificationsInboxSection
        unreadCount={inbox.unreadCount}
        pages={inbox.pages}
        isLoadingMore={inbox.isLoadingMore}
        hasMore={inbox.hasMore}
        onLoadMore={inbox.loadMore}
        onOpenNotification={inbox.openNotification}
        onMarkRead={inbox.markRead}
        onMarkAllRead={inbox.markAllRead}
      />

      <MinistryScheduleSection
        ministries={dashboard.ministryOptions}
        selectedMinistryId={dashboard.selectedMinistryId}
        canSwitchMinistry={dashboard.ministryOptions.length > 1}
        events={dashboard.ministrySchedule?.events ?? []}
        isLoading={dashboard.ministryScheduleQuery.isLoading}
        onSelectMinistry={dashboard.setSelectedMinistryId}
      />

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

      <NotificationDetailSheet
        open={inbox.selectedNotification != null}
        notification={inbox.selectedNotification}
        onOpenChange={(open) => {
          if (!open) {
            inbox.setSelectedNotificationId(undefined);
          }
        }}
        onOpenContext={handleOpenNotificationContext}
      />
    </div>
  );
}
