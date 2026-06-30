import { router } from '../trpc';
import { deleteAvailability } from './volunteer/delete-availability';
import { getMinistrySchedule } from './volunteer/get-ministry-schedule';
import { getMyAvailability } from './volunteer/get-my-availability';
import { getMyNotifications } from './volunteer/get-my-notifications';
import { getMyUpcomingAssignments } from './volunteer/get-my-upcoming-assignments';
import { getVolunteerDashboard } from './volunteer/get-volunteer-dashboard';
import { markAllNotificationsRead } from './volunteer/mark-all-notifications-read';
import { markNotificationRead } from './volunteer/mark-notification-read';
import { respondToAssignment } from './volunteer/respond-to-assignment';
import { upsertAvailability } from './volunteer/upsert-availability';

export const volunteerRouter = router({
  deleteAvailability,
  getMinistrySchedule,
  getMyAvailability,
  getMyNotifications,
  getMyUpcomingAssignments,
  getVolunteerDashboard,
  markAllNotificationsRead,
  markNotificationRead,
  respondToAssignment,
  upsertAvailability,
});
